/**
 * useCreateUserForm — the state machine + IO for the Create/Edit User
 * screen.
 *
 * Owns every form field, the picker open/close booleans, the contact
 * roster, and the submit/load lifecycle. The screen-level component is
 * a pure presentational shell that subscribes to this hook.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  api,
  ManufacturerContact,
  Role,
  User,
} from "@/src/api/client";
import { notify } from "@/src/utils/confirm";
import {
  dialCodeFor,
  formatAsYouType,
  formatStored,
} from "@/src/utils/phone";
import {
  Country,
  DIAL_CODE_FALLBACK,
  StateEntry,
  emptyContact,
} from "../types";

export function useCreateUserForm() {
  const router = useRouter();
  const { role: initialRole, userId } = useLocalSearchParams<{
    role?: string;
    userId?: string;
  }>();
  const editMode = !!userId;

  // ---- Form fields ------------------------------------------------------
  const [role, setRole] = useState<Role>(
    (initialRole as Role) || "manufacturer",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [password, setPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [country, setCountry] = useState<string>("AU");

  // ---- Reference data ---------------------------------------------------
  const [countries, setCountries] = useState<Country[]>([]);
  const [associates, setAssociates] = useState<User[]>([]);
  const [selectedAssociate, setSelectedAssociate] = useState<User | null>(null);

  // ---- Picker visibility ------------------------------------------------
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);

  // ---- Vendor (manufacturer / cad_renderer) contact roster -------------
  const [contacts, setContacts] = useState<ManufacturerContact[]>(() => [
    emptyContact(),
    emptyContact(),
    emptyContact(),
  ]);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const [expandedContactIdx, setExpandedContactIdx] = useState<number>(0);

  // ---- Submit lifecycle -------------------------------------------------
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Hydration --------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const [a, c] = await Promise.all([
          api.listUsers("associate"),
          api.listCountries(),
        ]);
        setAssociates(a);
        setCountries(c);
        if (editMode && userId) {
          const u = await api.getUser(userId);
          setRole(u.role);
          setName(u.name || "");
          setEmail(u.email || "");
          setPhoneNumber(
            formatStored(u.phone_number || "", u.country || "AU"),
          );
          setBirthday(u.birthday || "");
          setCity(u.city || "");
          setState(u.state || "");
          setAddressLine1(u.address_line1 || "");
          setAddressLine2(u.address_line2 || "");
          setCountry(u.country || "AU");
          if (u.role === "client" && u.associate_id) {
            const owner = a.find((x: User) => x.id === u.associate_id);
            if (owner) setSelectedAssociate(owner);
          }
          if (
            (u.role === "manufacturer" || u.role === "cad_renderer") &&
            Array.isArray(u.contacts)
          ) {
            const padded: ManufacturerContact[] = [...u.contacts];
            while (padded.length < 3) padded.push(emptyContact());
            setContacts(padded.slice(0, 3));
            setPrimaryContactId(
              u.primary_contact_id || padded[0]?.id || null,
            );
          }
        }
      } catch {
        /* non-fatal: form still works without picker */
      }
    })();
  }, [editMode, userId]);

  // ---- Derived data -----------------------------------------------------
  const selectedCountry = useMemo(
    () => countries.find((c) => c.code === country),
    [countries, country],
  );
  const dialCode =
    selectedCountry?.dial_code ||
    dialCodeFor(country) ||
    DIAL_CODE_FALLBACK[country] ||
    "";
  const stateLabel = selectedCountry?.state_label || "State / Region";
  const stateOptions = useMemo<StateEntry[]>(
    () => selectedCountry?.states || [],
    [selectedCountry],
  );
  const hasStateDropdown = stateOptions.length > 0;
  const selectedStateName = useMemo(() => {
    if (!hasStateDropdown || !state) return "";
    const hit = stateOptions.find(
      (s) => s.code === state || s.name === state,
    );
    return hit ? hit.name : state;
  }, [hasStateDropdown, state, stateOptions]);

  // Clear stale free-text state value when switching to a dropdown country.
  useEffect(() => {
    if (!hasStateDropdown) return;
    if (!state) return;
    const valid = stateOptions.some(
      (s) => s.code === state || s.name === state,
    );
    if (!valid) setState("");
  }, [hasStateDropdown, stateOptions, state]);

  // Re-format phone with the new country mask whenever country changes.
  useEffect(() => {
    if (!phoneNumber) return;
    setPhoneNumber(formatAsYouType(phoneNumber, country));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // ---- Contact helpers --------------------------------------------------
  const updateContact = (
    idx: number,
    patch: Partial<ManufacturerContact>,
  ): void => {
    setContacts((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };

  const contactPhoneCountry = (c: ManufacturerContact): string =>
    (c.country && c.country.trim()) || country;

  const handleContactPhone = (
    idx: number,
    field: "mobile_number" | "whatsapp_number",
    value: string,
  ) => {
    const cc = contactPhoneCountry(contacts[idx]);
    updateContact(idx, { [field]: formatAsYouType(value, cc) } as any);
  };

  const persistContacts = async (uid: string) => {
    const cleaned: ManufacturerContact[] = contacts.map((c) => ({
      id:
        c.id && !String(c.id).startsWith("tmp-") ? c.id : undefined,
      name: c.name || null,
      company_title: c.company_title || null,
      country: c.country || null,
      mobile_number: c.mobile_number || null,
      whatsapp_number: c.whatsapp_number || null,
      wechat_id: c.wechat_id || null,
      other_label: c.other_label || null,
      other_value: c.other_value || null,
      email: c.email || null,
    }));
    const primaryIdx = contacts.findIndex((c) => c.id === primaryContactId);
    let primaryToSend: string | null = null;
    if (primaryIdx >= 0 && cleaned[primaryIdx]?.id) {
      primaryToSend = cleaned[primaryIdx]!.id!;
    }
    const res = await api.setManufacturerContacts(uid, {
      contacts: cleaned,
      primary_contact_id: primaryToSend,
    });
    setContacts(res.contacts);
    setPrimaryContactId(res.primary_contact_id);
  };

  // ---- Submit -----------------------------------------------------------
  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!editMode && (!password.trim() || password.length < 6)) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (
      editMode &&
      showPasswordReset &&
      password.trim() &&
      password.length < 6
    ) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      setError("Birthday must be in YYYY-MM-DD format.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editMode && userId) {
        await api.updateUserProfile(userId, {
          name: name.trim(),
          associate_id:
            role === "client" ? (selectedAssociate?.id ?? null) : null,
          country,
          phone_dial_code: dialCode || null,
          phone_number: phoneNumber.trim() || null,
          birthday: birthday.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
        });
        if (showPasswordReset && password.trim()) {
          await api.setUserPassword(userId, password);
        }
        if (role === "manufacturer" || role === "cad_renderer") {
          await persistContacts(userId);
        }
        notify(
          "User updated",
          showPasswordReset && password.trim()
            ? `${name.trim()} has been updated and password reset.`
            : `${name.trim()} has been updated.`,
        );
      } else {
        await api.createUser({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          associate_id:
            role === "client" ? (selectedAssociate?.id ?? null) : null,
          country,
          phone_dial_code: dialCode || null,
          phone_number: phoneNumber.trim() || null,
          birthday: birthday.trim() || null,
          city: city.trim() || null,
          state: state.trim() || null,
          address_line1: addressLine1.trim() || null,
          address_line2: addressLine2.trim() || null,
        } as any);
        if (role === "manufacturer" || role === "cad_renderer") {
          try {
            const all = await api.listUsers(role);
            const just = all.find(
              (u: User) =>
                u.email.toLowerCase() === email.trim().toLowerCase(),
            );
            if (just) await persistContacts(just.id);
          } catch {
            /* contacts will be empty until the admin re-opens the screen */
          }
        }
        notify(
          `${
            role === "manufacturer"
              ? "Workshop"
              : role === "cad_renderer"
                ? "CAD & Render vendor"
                : "Client"
          } created`,
          `${name.trim()} has been added.`,
        );
      }
      router.back();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  return {
    // mode
    editMode,
    userId,
    // fields
    role, setRole,
    name, setName,
    email, setEmail,
    phoneNumber, setPhoneNumber,
    birthday, setBirthday,
    city, setCity,
    state, setState,
    addressLine1, setAddressLine1,
    addressLine2, setAddressLine2,
    password, setPassword,
    showPasswordReset, setShowPasswordReset,
    country, setCountry,
    // reference data
    countries,
    associates,
    selectedAssociate, setSelectedAssociate,
    // pickers
    showCountryPicker, setShowCountryPicker,
    showStatePicker, setShowStatePicker,
    // contacts
    contacts,
    primaryContactId, setPrimaryContactId,
    expandedContactIdx, setExpandedContactIdx,
    updateContact,
    handleContactPhone,
    // derived
    selectedCountry,
    dialCode,
    stateLabel,
    stateOptions,
    hasStateDropdown,
    selectedStateName,
    // submit lifecycle
    saving,
    error,
    submit,
    // phone helper for the top-level mobile field
    handlePhoneChange: (next: string) =>
      setPhoneNumber(formatAsYouType(next, country)),
  };
}
