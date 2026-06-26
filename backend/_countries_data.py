"""Country metadata for Somnio.Co Atelier: dial codes, regional terminology,
phone number masks, and ISO 3166-2 state / region subdivisions.

This is the single source of truth consumed by ``GET /api/meta/countries``.
The dataset only covers the 35 ISO codes we ship in ``COUNTRY_LIST``; if a
country is added to that list, append a matching entry here (an empty
``states`` list is acceptable for city-states / countries without a useful
regional breakdown).

Phone masks use ``#`` as a digit placeholder; spaces / dashes / parentheses
are rendered as-is. Front-end code typing a number progressively replaces
``#`` characters left-to-right.
"""
from __future__ import annotations

from typing import Dict, List, TypedDict


class StateEntry(TypedDict):
    code: str
    name: str


class CountryMeta(TypedDict):
    dial_code: str
    state_label: str  # localized noun: "State", "Province", "Region", …
    phone_format: str  # mask without dial code, e.g. "### ### ###"
    states: List[StateEntry]


# Helper to build a list of {code,name} from a list of (code,name) tuples.
def _S(pairs: List[tuple[str, str]]) -> List[StateEntry]:
    return [{"code": c, "name": n} for c, n in pairs]


COUNTRY_META: Dict[str, CountryMeta] = {
    # ---------- Oceania ----------
    # AU / NZ / US / GB / CA / PH lists are mirrored verbatim from the
    # Somnio.Co source app (gem-gallery-193) so that records sync cleanly
    # between the two systems (associates / clients arrive with state values
    # in the "Name (CODE)" form already).
    "AU": {
        "dial_code": "+61",
        "state_label": "State / Territory",
        "phone_format": "### ### ###",
        "states": _S([
            ("NSW", "New South Wales (NSW)"),
            ("VIC", "Victoria (VIC)"),
            ("QLD", "Queensland (QLD)"),
            ("WA", "Western Australia (WA)"),
            ("SA", "South Australia (SA)"),
            ("TAS", "Tasmania (TAS)"),
            ("ACT", "Australian Capital Territory (ACT)"),
            ("NT", "Northern Territory (NT)"),
        ]),
    },
    "NZ": {
        "dial_code": "+64",
        "state_label": "Region",
        "phone_format": "### ### ####",
        "states": _S([
            ("NTL", "Northland"),
            ("AUK", "Auckland"),
            ("WKO", "Waikato"),
            ("BOP", "Bay of Plenty"),
            ("GIS", "Gisborne"),
            ("HKB", "Hawke's Bay"),
            ("TKI", "Taranaki"),
            ("MWT", "Manawatū-Whanganui"),
            ("WGN", "Wellington"),
            ("TAS", "Tasman"),
            ("NSN", "Nelson"),
            ("MBH", "Marlborough"),
            ("WTC", "West Coast"),
            ("CAN", "Canterbury"),
            ("OTA", "Otago"),
            ("STL", "Southland"),
        ]),
    },
    # ---------- North America ----------
    "US": {
        "dial_code": "+1",
        "state_label": "State",
        "phone_format": "(###) ###-####",
        "states": _S([
            ("AL", "Alabama (AL)"), ("AK", "Alaska (AK)"), ("AZ", "Arizona (AZ)"),
            ("AR", "Arkansas (AR)"), ("CA", "California (CA)"), ("CO", "Colorado (CO)"),
            ("CT", "Connecticut (CT)"), ("DE", "Delaware (DE)"), ("DC", "District of Columbia (DC)"),
            ("FL", "Florida (FL)"), ("GA", "Georgia (GA)"), ("HI", "Hawaii (HI)"),
            ("ID", "Idaho (ID)"), ("IL", "Illinois (IL)"), ("IN", "Indiana (IN)"),
            ("IA", "Iowa (IA)"), ("KS", "Kansas (KS)"), ("KY", "Kentucky (KY)"),
            ("LA", "Louisiana (LA)"), ("ME", "Maine (ME)"), ("MD", "Maryland (MD)"),
            ("MA", "Massachusetts (MA)"), ("MI", "Michigan (MI)"), ("MN", "Minnesota (MN)"),
            ("MS", "Mississippi (MS)"), ("MO", "Missouri (MO)"), ("MT", "Montana (MT)"),
            ("NE", "Nebraska (NE)"), ("NV", "Nevada (NV)"), ("NH", "New Hampshire (NH)"),
            ("NJ", "New Jersey (NJ)"), ("NM", "New Mexico (NM)"), ("NY", "New York (NY)"),
            ("NC", "North Carolina (NC)"), ("ND", "North Dakota (ND)"), ("OH", "Ohio (OH)"),
            ("OK", "Oklahoma (OK)"), ("OR", "Oregon (OR)"), ("PA", "Pennsylvania (PA)"),
            ("RI", "Rhode Island (RI)"), ("SC", "South Carolina (SC)"), ("SD", "South Dakota (SD)"),
            ("TN", "Tennessee (TN)"), ("TX", "Texas (TX)"), ("UT", "Utah (UT)"),
            ("VT", "Vermont (VT)"), ("VA", "Virginia (VA)"), ("WA", "Washington (WA)"),
            ("WV", "West Virginia (WV)"), ("WI", "Wisconsin (WI)"), ("WY", "Wyoming (WY)"),
        ]),
    },
    "CA": {
        "dial_code": "+1",
        "state_label": "Province / Territory",
        "phone_format": "(###) ###-####",
        "states": _S([
            ("AB", "Alberta (AB)"), ("BC", "British Columbia (BC)"),
            ("MB", "Manitoba (MB)"), ("NB", "New Brunswick (NB)"),
            ("NL", "Newfoundland and Labrador (NL)"),
            ("NS", "Nova Scotia (NS)"), ("ON", "Ontario (ON)"),
            ("PE", "Prince Edward Island (PE)"), ("QC", "Quebec (QC)"),
            ("SK", "Saskatchewan (SK)"), ("NT", "Northwest Territories (NT)"),
            ("NU", "Nunavut (NU)"), ("YT", "Yukon (YT)"),
        ]),
    },
    "MX": {
        "dial_code": "+52",
        "state_label": "State",
        "phone_format": "### ### ####",
        "states": _S([
            ("AGU", "Aguascalientes"), ("BCN", "Baja California"),
            ("BCS", "Baja California Sur"), ("CAM", "Campeche"),
            ("CHP", "Chiapas"), ("CHH", "Chihuahua"), ("CMX", "Ciudad de México"),
            ("COA", "Coahuila"), ("COL", "Colima"), ("DUR", "Durango"),
            ("GUA", "Guanajuato"), ("GRO", "Guerrero"), ("HID", "Hidalgo"),
            ("JAL", "Jalisco"), ("MEX", "México"), ("MIC", "Michoacán"),
            ("MOR", "Morelos"), ("NAY", "Nayarit"), ("NLE", "Nuevo León"),
            ("OAX", "Oaxaca"), ("PUE", "Puebla"), ("QUE", "Querétaro"),
            ("ROO", "Quintana Roo"), ("SLP", "San Luis Potosí"),
            ("SIN", "Sinaloa"), ("SON", "Sonora"), ("TAB", "Tabasco"),
            ("TAM", "Tamaulipas"), ("TLA", "Tlaxcala"), ("VER", "Veracruz"),
            ("YUC", "Yucatán"), ("ZAC", "Zacatecas"),
        ]),
    },
    # ---------- United Kingdom / Ireland ----------
    "GB": {
        "dial_code": "+44",
        "state_label": "Country / Region",
        "phone_format": "#### ######",
        "states": _S([
            ("ENG", "England"),
            ("SCT", "Scotland"),
            ("WLS", "Wales"),
            ("NIR", "Northern Ireland"),
            ("LDN", "Greater London"),
            ("SEE", "South East England"),
            ("SWE", "South West England"),
            ("EOE", "East of England"),
            ("EM", "East Midlands"),
            ("WM", "West Midlands"),
            ("YH", "Yorkshire and the Humber"),
            ("NWE", "North West England"),
            ("NEE", "North East England"),
        ]),
    },
    "IE": {
        "dial_code": "+353",
        "state_label": "County",
        "phone_format": "## ### ####",
        "states": _S([
            ("CW", "Carlow"), ("CN", "Cavan"), ("CE", "Clare"), ("CO", "Cork"),
            ("DL", "Donegal"), ("D", "Dublin"), ("G", "Galway"), ("KY", "Kerry"),
            ("KE", "Kildare"), ("KK", "Kilkenny"), ("LS", "Laois"), ("LM", "Leitrim"),
            ("LK", "Limerick"), ("LD", "Longford"), ("LH", "Louth"), ("MO", "Mayo"),
            ("MH", "Meath"), ("MN", "Monaghan"), ("OY", "Offaly"), ("RN", "Roscommon"),
            ("SO", "Sligo"), ("TA", "Tipperary"), ("WD", "Waterford"),
            ("WH", "Westmeath"), ("WX", "Wexford"), ("WW", "Wicklow"),
        ]),
    },
    # ---------- Western Europe ----------
    "FR": {
        "dial_code": "+33",
        "state_label": "Region",
        "phone_format": "# ## ## ## ##",
        "states": _S([
            ("ARA", "Auvergne-Rhône-Alpes"),
            ("BFC", "Bourgogne-Franche-Comté"),
            ("BRE", "Bretagne"),
            ("CVL", "Centre-Val de Loire"),
            ("COR", "Corse"),
            ("GES", "Grand Est"),
            ("HDF", "Hauts-de-France"),
            ("IDF", "Île-de-France"),
            ("NOR", "Normandie"),
            ("NAQ", "Nouvelle-Aquitaine"),
            ("OCC", "Occitanie"),
            ("PDL", "Pays de la Loire"),
            ("PAC", "Provence-Alpes-Côte d'Azur"),
        ]),
    },
    "BE": {
        "dial_code": "+32",
        "state_label": "Region",
        "phone_format": "### ## ## ##",
        "states": _S([
            ("BRU", "Brussels-Capital"),
            ("VLG", "Flanders"),
            ("WAL", "Wallonia"),
        ]),
    },
    "CH": {
        "dial_code": "+41",
        "state_label": "Canton",
        "phone_format": "## ### ## ##",
        "states": _S([
            ("AG", "Aargau"), ("AR", "Appenzell Ausserrhoden"),
            ("AI", "Appenzell Innerrhoden"), ("BL", "Basel-Landschaft"),
            ("BS", "Basel-Stadt"), ("BE", "Bern"), ("FR", "Fribourg"),
            ("GE", "Genève"), ("GL", "Glarus"), ("GR", "Graubünden"),
            ("JU", "Jura"), ("LU", "Luzern"), ("NE", "Neuchâtel"),
            ("NW", "Nidwalden"), ("OW", "Obwalden"), ("SH", "Schaffhausen"),
            ("SZ", "Schwyz"), ("SO", "Solothurn"), ("SG", "St. Gallen"),
            ("TG", "Thurgau"), ("TI", "Ticino"), ("UR", "Uri"),
            ("VS", "Valais"), ("VD", "Vaud"), ("ZG", "Zug"), ("ZH", "Zürich"),
        ]),
    },
    "DE": {
        "dial_code": "+49",
        "state_label": "Bundesland",
        "phone_format": "### #######",
        "states": _S([
            ("BW", "Baden-Württemberg"), ("BY", "Bayern"), ("BE", "Berlin"),
            ("BB", "Brandenburg"), ("HB", "Bremen"), ("HH", "Hamburg"),
            ("HE", "Hessen"), ("MV", "Mecklenburg-Vorpommern"),
            ("NI", "Niedersachsen"), ("NW", "Nordrhein-Westfalen"),
            ("RP", "Rheinland-Pfalz"), ("SL", "Saarland"), ("SN", "Sachsen"),
            ("ST", "Sachsen-Anhalt"), ("SH", "Schleswig-Holstein"),
            ("TH", "Thüringen"),
        ]),
    },
    "AT": {
        "dial_code": "+43",
        "state_label": "Bundesland",
        "phone_format": "### #######",
        "states": _S([
            ("1", "Burgenland"), ("2", "Kärnten"), ("3", "Niederösterreich"),
            ("4", "Oberösterreich"), ("5", "Salzburg"), ("6", "Steiermark"),
            ("7", "Tirol"), ("8", "Vorarlberg"), ("9", "Wien"),
        ]),
    },
    "IT": {
        "dial_code": "+39",
        "state_label": "Region",
        "phone_format": "### #######",
        "states": _S([
            ("ABR", "Abruzzo"), ("BAS", "Basilicata"), ("CAL", "Calabria"),
            ("CAM", "Campania"), ("EMR", "Emilia-Romagna"),
            ("FVG", "Friuli-Venezia Giulia"), ("LAZ", "Lazio"),
            ("LIG", "Liguria"), ("LOM", "Lombardia"), ("MAR", "Marche"),
            ("MOL", "Molise"), ("PIE", "Piemonte"), ("PUG", "Puglia"),
            ("SAR", "Sardegna"), ("SIC", "Sicilia"), ("TAA", "Trentino-Alto Adige"),
            ("TOS", "Toscana"), ("UMB", "Umbria"), ("VAO", "Valle d'Aosta"),
            ("VEN", "Veneto"),
        ]),
    },
    "ES": {
        "dial_code": "+34",
        "state_label": "Autonomous Community",
        "phone_format": "### ## ## ##",
        "states": _S([
            ("AN", "Andalucía"), ("AR", "Aragón"), ("AS", "Asturias"),
            ("CN", "Canarias"), ("CB", "Cantabria"), ("CL", "Castilla y León"),
            ("CM", "Castilla-La Mancha"), ("CT", "Cataluña"),
            ("CE", "Ceuta"), ("EX", "Extremadura"), ("GA", "Galicia"),
            ("IB", "Illes Balears"), ("RI", "La Rioja"), ("MD", "Madrid"),
            ("ML", "Melilla"), ("MC", "Murcia"), ("NC", "Navarra"),
            ("PV", "País Vasco"), ("VC", "Comunidad Valenciana"),
        ]),
    },
    "PT": {
        "dial_code": "+351",
        "state_label": "District",
        "phone_format": "### ### ###",
        "states": _S([
            ("01", "Aveiro"), ("02", "Beja"), ("03", "Braga"), ("04", "Bragança"),
            ("05", "Castelo Branco"), ("06", "Coimbra"), ("07", "Évora"),
            ("08", "Faro"), ("09", "Guarda"), ("10", "Leiria"), ("11", "Lisboa"),
            ("12", "Portalegre"), ("13", "Porto"), ("14", "Santarém"),
            ("15", "Setúbal"), ("16", "Viana do Castelo"), ("17", "Vila Real"),
            ("18", "Viseu"), ("20", "Açores"), ("30", "Madeira"),
        ]),
    },
    "NL": {
        "dial_code": "+31",
        "state_label": "Province",
        "phone_format": "## #######",
        "states": _S([
            ("DR", "Drenthe"), ("FL", "Flevoland"), ("FR", "Friesland"),
            ("GE", "Gelderland"), ("GR", "Groningen"), ("LI", "Limburg"),
            ("NB", "Noord-Brabant"), ("NH", "Noord-Holland"),
            ("OV", "Overijssel"), ("UT", "Utrecht"), ("ZE", "Zeeland"),
            ("ZH", "Zuid-Holland"),
        ]),
    },
    "GR": {
        "dial_code": "+30",
        "state_label": "Region",
        "phone_format": "### #######",
        "states": _S([
            ("A", "Eastern Macedonia and Thrace"), ("B", "Central Macedonia"),
            ("C", "Western Macedonia"), ("D", "Epirus"), ("E", "Thessaly"),
            ("F", "Ionian Islands"), ("G", "Western Greece"),
            ("H", "Central Greece"), ("I", "Attica"), ("J", "Peloponnese"),
            ("K", "Northern Aegean"), ("L", "Southern Aegean"), ("M", "Crete"),
            ("69", "Mount Athos"),
        ]),
    },
    # ---------- Eastern Europe ----------
    "RU": {
        "dial_code": "+7",
        "state_label": "Federal Subject",
        "phone_format": "(###) ###-##-##",
        "states": _S([
            ("MOW", "Moscow"), ("SPE", "Saint Petersburg"),
            ("MOS", "Moscow Oblast"), ("LEN", "Leningrad Oblast"),
            ("KDA", "Krasnodar Krai"), ("SVE", "Sverdlovsk Oblast"),
            ("ROS", "Rostov Oblast"), ("TYU", "Tyumen Oblast"),
            ("NVS", "Novosibirsk Oblast"), ("KYA", "Krasnoyarsk Krai"),
            ("TAT", "Tatarstan"), ("BA", "Bashkortostan"),
            ("CE", "Chechnya"), ("DA", "Dagestan"),
        ]),
    },
    # ---------- Asia (East / SE) ----------
    "CN": {
        "dial_code": "+86",
        "state_label": "Province",
        "phone_format": "### #### ####",
        "states": _S([
            ("BJ", "Beijing"), ("TJ", "Tianjin"), ("SH", "Shanghai"),
            ("CQ", "Chongqing"), ("HE", "Hebei"), ("SX", "Shanxi"),
            ("LN", "Liaoning"), ("JL", "Jilin"), ("HL", "Heilongjiang"),
            ("JS", "Jiangsu"), ("ZJ", "Zhejiang"), ("AH", "Anhui"),
            ("FJ", "Fujian"), ("JX", "Jiangxi"), ("SD", "Shandong"),
            ("HA", "Henan"), ("HB", "Hubei"), ("HN", "Hunan"),
            ("GD", "Guangdong"), ("HI", "Hainan"), ("SC", "Sichuan"),
            ("GZ", "Guizhou"), ("YN", "Yunnan"), ("SN", "Shaanxi"),
            ("GS", "Gansu"), ("QH", "Qinghai"), ("NM", "Inner Mongolia"),
            ("GX", "Guangxi"), ("XZ", "Tibet"), ("NX", "Ningxia"),
            ("XJ", "Xinjiang"),
        ]),
    },
    "HK": {
        "dial_code": "+852",
        "state_label": "District",
        "phone_format": "#### ####",
        "states": _S([
            ("HCW", "Central and Western"), ("HEA", "Eastern"),
            ("HSO", "Southern"), ("HWC", "Wan Chai"),
            ("KKC", "Kowloon City"), ("KKT", "Kwun Tong"),
            ("KSS", "Sham Shui Po"), ("KWT", "Wong Tai Sin"),
            ("KYT", "Yau Tsim Mong"), ("NIS", "Islands"), ("NKT", "Kwai Tsing"),
            ("NNO", "North"), ("NSK", "Sai Kung"), ("NSH", "Sha Tin"),
            ("NTP", "Tai Po"), ("NTW", "Tsuen Wan"), ("NTM", "Tuen Mun"),
            ("NYL", "Yuen Long"),
        ]),
    },
    "TW": {
        "dial_code": "+886",
        "state_label": "City / County",
        "phone_format": "### ### ###",
        "states": _S([
            ("TPE", "Taipei City"), ("NTPC", "New Taipei City"),
            ("TYC", "Taoyuan City"), ("TXG", "Taichung City"),
            ("TNN", "Tainan City"), ("KHH", "Kaohsiung City"),
            ("HSZ", "Hsinchu City"), ("CYI", "Chiayi City"),
            ("KEE", "Keelung City"), ("HSQ", "Hsinchu County"),
            ("MIA", "Miaoli County"), ("CHA", "Changhua County"),
            ("NAN", "Nantou County"), ("YUN", "Yunlin County"),
            ("CYQ", "Chiayi County"), ("PIF", "Pingtung County"),
            ("ILA", "Yilan County"), ("HUA", "Hualien County"),
            ("TTT", "Taitung County"), ("PEN", "Penghu County"),
            ("KIN", "Kinmen County"), ("LIE", "Lienchiang County"),
        ]),
    },
    "JP": {
        "dial_code": "+81",
        "state_label": "Prefecture",
        "phone_format": "## #### ####",
        "states": _S([
            ("01", "Hokkaido"), ("02", "Aomori"), ("03", "Iwate"),
            ("04", "Miyagi"), ("05", "Akita"), ("06", "Yamagata"),
            ("07", "Fukushima"), ("08", "Ibaraki"), ("09", "Tochigi"),
            ("10", "Gunma"), ("11", "Saitama"), ("12", "Chiba"),
            ("13", "Tokyo"), ("14", "Kanagawa"), ("15", "Niigata"),
            ("16", "Toyama"), ("17", "Ishikawa"), ("18", "Fukui"),
            ("19", "Yamanashi"), ("20", "Nagano"), ("21", "Gifu"),
            ("22", "Shizuoka"), ("23", "Aichi"), ("24", "Mie"),
            ("25", "Shiga"), ("26", "Kyoto"), ("27", "Osaka"),
            ("28", "Hyogo"), ("29", "Nara"), ("30", "Wakayama"),
            ("31", "Tottori"), ("32", "Shimane"), ("33", "Okayama"),
            ("34", "Hiroshima"), ("35", "Yamaguchi"), ("36", "Tokushima"),
            ("37", "Kagawa"), ("38", "Ehime"), ("39", "Kochi"),
            ("40", "Fukuoka"), ("41", "Saga"), ("42", "Nagasaki"),
            ("43", "Kumamoto"), ("44", "Oita"), ("45", "Miyazaki"),
            ("46", "Kagoshima"), ("47", "Okinawa"),
        ]),
    },
    "KR": {
        "dial_code": "+82",
        "state_label": "Province",
        "phone_format": "## #### ####",
        "states": _S([
            ("11", "Seoul"), ("26", "Busan"), ("27", "Daegu"),
            ("28", "Incheon"), ("29", "Gwangju"), ("30", "Daejeon"),
            ("31", "Ulsan"), ("36", "Sejong"), ("41", "Gyeonggi"),
            ("42", "Gangwon"), ("43", "North Chungcheong"),
            ("44", "South Chungcheong"), ("45", "North Jeolla"),
            ("46", "South Jeolla"), ("47", "North Gyeongsang"),
            ("48", "South Gyeongsang"), ("50", "Jeju"),
        ]),
    },
    "SG": {
        "dial_code": "+65",
        "state_label": "District",
        "phone_format": "#### ####",
        "states": _S([
            ("01", "Central Region"), ("02", "East Region"),
            ("03", "North Region"), ("04", "North-East Region"),
            ("05", "West Region"),
        ]),
    },
    "TH": {
        "dial_code": "+66",
        "state_label": "Province",
        "phone_format": "## ### ####",
        "states": _S([
            ("10", "Bangkok"), ("11", "Samut Prakan"), ("12", "Nonthaburi"),
            ("13", "Pathum Thani"), ("14", "Phra Nakhon Si Ayutthaya"),
            ("15", "Ang Thong"), ("16", "Lopburi"), ("17", "Sing Buri"),
            ("18", "Chai Nat"), ("19", "Saraburi"), ("20", "Chonburi"),
            ("21", "Rayong"), ("22", "Chanthaburi"), ("23", "Trat"),
            ("24", "Chachoengsao"), ("25", "Prachinburi"), ("26", "Nakhon Nayok"),
            ("27", "Sa Kaeo"), ("30", "Nakhon Ratchasima"), ("31", "Buriram"),
            ("32", "Surin"), ("33", "Sisaket"), ("34", "Ubon Ratchathani"),
            ("35", "Yasothon"), ("36", "Chaiyaphum"), ("37", "Amnat Charoen"),
            ("38", "Bueng Kan"), ("39", "Nong Bua Lamphu"), ("40", "Khon Kaen"),
            ("41", "Udon Thani"), ("42", "Loei"), ("43", "Nong Khai"),
            ("44", "Maha Sarakham"), ("45", "Roi Et"), ("46", "Kalasin"),
            ("47", "Sakon Nakhon"), ("48", "Nakhon Phanom"), ("49", "Mukdahan"),
            ("50", "Chiang Mai"), ("51", "Lamphun"), ("52", "Lampang"),
            ("53", "Uttaradit"), ("54", "Phrae"), ("55", "Nan"),
            ("56", "Phayao"), ("57", "Chiang Rai"), ("58", "Mae Hong Son"),
            ("60", "Nakhon Sawan"), ("61", "Uthai Thani"), ("62", "Kamphaeng Phet"),
            ("63", "Tak"), ("64", "Sukhothai"), ("65", "Phitsanulok"),
            ("66", "Phichit"), ("67", "Phetchabun"), ("70", "Ratchaburi"),
            ("71", "Kanchanaburi"), ("72", "Suphan Buri"), ("73", "Nakhon Pathom"),
            ("74", "Samut Sakhon"), ("75", "Samut Songkhram"),
            ("76", "Phetchaburi"), ("77", "Prachuap Khiri Khan"),
            ("80", "Nakhon Si Thammarat"), ("81", "Krabi"), ("82", "Phangnga"),
            ("83", "Phuket"), ("84", "Surat Thani"), ("85", "Ranong"),
            ("86", "Chumphon"), ("90", "Songkhla"), ("91", "Satun"),
            ("92", "Trang"), ("93", "Phatthalung"), ("94", "Pattani"),
            ("95", "Yala"), ("96", "Narathiwat"),
        ]),
    },
    "ID": {
        "dial_code": "+62",
        "state_label": "Province",
        "phone_format": "### ### ####",
        "states": _S([
            ("AC", "Aceh"), ("BA", "Bali"), ("BB", "Bangka Belitung"),
            ("BT", "Banten"), ("BE", "Bengkulu"), ("YO", "Yogyakarta"),
            ("JK", "Jakarta"), ("GO", "Gorontalo"), ("JA", "Jambi"),
            ("JB", "West Java"), ("JT", "Central Java"), ("JI", "East Java"),
            ("KB", "West Kalimantan"), ("KS", "South Kalimantan"),
            ("KT", "Central Kalimantan"), ("KI", "East Kalimantan"),
            ("KU", "North Kalimantan"), ("KR", "Riau Islands"),
            ("LA", "Lampung"), ("MA", "Maluku"), ("MU", "North Maluku"),
            ("NB", "West Nusa Tenggara"), ("NT", "East Nusa Tenggara"),
            ("PA", "Papua"), ("PB", "West Papua"), ("RI", "Riau"),
            ("SR", "West Sulawesi"), ("SN", "South Sulawesi"),
            ("ST", "Central Sulawesi"), ("SG", "Southeast Sulawesi"),
            ("SA", "North Sulawesi"), ("SB", "West Sumatra"),
            ("SS", "South Sumatra"), ("SU", "North Sumatra"),
        ]),
    },
    "MY": {
        "dial_code": "+60",
        "state_label": "State",
        "phone_format": "## ### ####",
        "states": _S([
            ("JHR", "Johor"), ("KDH", "Kedah"), ("KTN", "Kelantan"),
            ("KUL", "Kuala Lumpur"), ("LBN", "Labuan"), ("MLK", "Malacca"),
            ("NSN", "Negeri Sembilan"), ("PHG", "Pahang"), ("PNG", "Penang"),
            ("PRK", "Perak"), ("PLS", "Perlis"), ("PJY", "Putrajaya"),
            ("SBH", "Sabah"), ("SWK", "Sarawak"), ("SGR", "Selangor"),
            ("TRG", "Terengganu"),
        ]),
    },
    "VN": {
        "dial_code": "+84",
        "state_label": "Province",
        "phone_format": "### ### ###",
        "states": _S([            ("HN", "Hanoi"), ("SG", "Ho Chi Minh City"), ("DN", "Da Nang"),
            ("HP", "Hai Phong"), ("CT", "Can Tho"), ("AG", "An Giang"),
            ("BG", "Bac Giang"), ("BK", "Bac Kan"), ("BL", "Bac Lieu"),
            ("BN", "Bac Ninh"), ("BR", "Ba Ria-Vung Tau"), ("BT", "Ben Tre"),
            ("BD", "Binh Duong"), ("BP", "Binh Phuoc"), ("BTH", "Binh Thuan"),
            ("CM", "Ca Mau"), ("CB", "Cao Bang"), ("DL", "Dak Lak"),
            ("DKN", "Dak Nong"), ("DB", "Dien Bien"), ("DG", "Dong Nai"),
            ("DT", "Dong Thap"), ("GL", "Gia Lai"), ("HG", "Ha Giang"),
            ("HNM", "Ha Nam"), ("HT", "Ha Tinh"), ("HD", "Hai Duong"),
            ("HB", "Hoa Binh"), ("HY", "Hung Yen"), ("KH", "Khanh Hoa"),
            ("KG", "Kien Giang"), ("KT", "Kon Tum"), ("LCH", "Lai Chau"),
            ("LD", "Lam Dong"), ("LS", "Lang Son"), ("LC", "Lao Cai"),
            ("LA", "Long An"), ("ND", "Nam Dinh"), ("NA", "Nghe An"),
            ("NB", "Ninh Binh"), ("NT", "Ninh Thuan"), ("PT", "Phu Tho"),
            ("PY", "Phu Yen"), ("QB", "Quang Binh"), ("QNM", "Quang Nam"),
            ("QNG", "Quang Ngai"), ("QN", "Quang Ninh"), ("QT", "Quang Tri"),
            ("ST", "Soc Trang"), ("SL", "Son La"), ("TY", "Tay Ninh"),
            ("TH", "Thai Binh"), ("TN", "Thai Nguyen"), ("TX", "Thanh Hoa"),
            ("TTH", "Thua Thien Hue"), ("TG", "Tien Giang"), ("TV", "Tra Vinh"),
            ("TQ", "Tuyen Quang"), ("VL", "Vinh Long"), ("VP", "Vinh Phuc"),
            ("YB", "Yen Bai"),
        ]),
    },
    # ---------- South Asia ----------
    "IN": {
        "dial_code": "+91",
        "state_label": "State / UT",
        "phone_format": "##### #####",
        "states": _S([
            ("AN", "Andaman and Nicobar Islands"), ("AP", "Andhra Pradesh"),
            ("AR", "Arunachal Pradesh"), ("AS", "Assam"), ("BR", "Bihar"),
            ("CH", "Chandigarh"), ("CT", "Chhattisgarh"),
            ("DN", "Dadra and Nagar Haveli and Daman and Diu"), ("DL", "Delhi"),
            ("GA", "Goa"), ("GJ", "Gujarat"), ("HR", "Haryana"),
            ("HP", "Himachal Pradesh"), ("JK", "Jammu and Kashmir"),
            ("JH", "Jharkhand"), ("KA", "Karnataka"), ("KL", "Kerala"),
            ("LA", "Ladakh"), ("LD", "Lakshadweep"), ("MP", "Madhya Pradesh"),
            ("MH", "Maharashtra"), ("MN", "Manipur"), ("ML", "Meghalaya"),
            ("MZ", "Mizoram"), ("NL", "Nagaland"), ("OR", "Odisha"),
            ("PY", "Puducherry"), ("PB", "Punjab"), ("RJ", "Rajasthan"),
            ("SK", "Sikkim"), ("TN", "Tamil Nadu"), ("TG", "Telangana"),
            ("TR", "Tripura"), ("UP", "Uttar Pradesh"), ("UT", "Uttarakhand"),
            ("WB", "West Bengal"),
        ]),
    },
    # ---------- Middle East ----------
    "AE": {
        "dial_code": "+971",
        "state_label": "Emirate",
        "phone_format": "## ### ####",
        "states": _S([
            ("AZ", "Abu Dhabi"), ("DU", "Dubai"), ("SH", "Sharjah"),
            ("AJ", "Ajman"), ("UQ", "Umm Al Quwain"),
            ("RK", "Ras Al Khaimah"), ("FU", "Fujairah"),
        ]),
    },
    "SA": {
        "dial_code": "+966",
        "state_label": "Region",
        "phone_format": "## ### ####",
        "states": _S([
            ("01", "Riyadh"), ("02", "Makkah"), ("03", "Madinah"),
            ("04", "Eastern Province"), ("05", "Qassim"), ("06", "Ha'il"),
            ("07", "Tabuk"), ("08", "Northern Borders"), ("09", "Jazan"),
            ("10", "Najran"), ("11", "Al Bahah"), ("12", "Al Jawf"),
            ("14", "Asir"),
        ]),
    },
    "QA": {
        "dial_code": "+974",
        "state_label": "Municipality",
        "phone_format": "#### ####",
        "states": _S([
            ("DA", "Doha"), ("RA", "Al Rayyan"), ("WA", "Al Wakrah"),
            ("KH", "Al Khor"), ("US", "Umm Salal"), ("MS", "Madinat ash Shamal"),
            ("ZA", "Al Daayen"), ("SH", "Al Shahaniya"),
        ]),
    },
    "TR": {
        "dial_code": "+90",
        "state_label": "Province",
        "phone_format": "### ### ## ##",
        "states": _S([
            ("01", "Adana"), ("06", "Ankara"), ("07", "Antalya"),
            ("16", "Bursa"), ("34", "Istanbul"), ("35", "Izmir"),
            ("38", "Kayseri"), ("42", "Konya"), ("55", "Samsun"),
            ("61", "Trabzon"), ("65", "Van"),
        ]),
    },
    # ---------- Africa ----------
    "ZA": {
        "dial_code": "+27",
        "state_label": "Province",
        "phone_format": "## ### ####",
        "states": _S([
            ("EC", "Eastern Cape"), ("FS", "Free State"), ("GP", "Gauteng"),
            ("KZN", "KwaZulu-Natal"), ("LP", "Limpopo"), ("MP", "Mpumalanga"),
            ("NC", "Northern Cape"), ("NW", "North West"), ("WC", "Western Cape"),
        ]),
    },
    # ---------- South America ----------
    "BR": {
        "dial_code": "+55",
        "state_label": "State",
        "phone_format": "(##) #####-####",
        "states": _S([
            ("AC", "Acre"), ("AL", "Alagoas"), ("AP", "Amapá"),
            ("AM", "Amazonas"), ("BA", "Bahia"), ("CE", "Ceará"),
            ("DF", "Distrito Federal"), ("ES", "Espírito Santo"),
            ("GO", "Goiás"), ("MA", "Maranhão"), ("MT", "Mato Grosso"),
            ("MS", "Mato Grosso do Sul"), ("MG", "Minas Gerais"),
            ("PA", "Pará"), ("PB", "Paraíba"), ("PR", "Paraná"),
            ("PE", "Pernambuco"), ("PI", "Piauí"), ("RJ", "Rio de Janeiro"),
            ("RN", "Rio Grande do Norte"), ("RS", "Rio Grande do Sul"),
            ("RO", "Rondônia"), ("RR", "Roraima"), ("SC", "Santa Catarina"),
            ("SP", "São Paulo"), ("SE", "Sergipe"), ("TO", "Tocantins"),
        ]),
    },
    # ---------- South-East Asia (additional) ----------
    "PH": {
        "dial_code": "+63",
        "state_label": "Region",
        "phone_format": "### ### ####",
        "states": _S([
            ("NCR", "National Capital Region (NCR)"),
            ("CAR", "Cordillera Administrative Region (CAR)"),
            ("R1", "Ilocos Region (Region I)"),
            ("R2", "Cagayan Valley (Region II)"),
            ("R3", "Central Luzon (Region III)"),
            ("R4A", "CALABARZON (Region IV-A)"),
            ("R4B", "MIMAROPA (Region IV-B)"),
            ("R5", "Bicol Region (Region V)"),
            ("R6", "Western Visayas (Region VI)"),
            ("R7", "Central Visayas (Region VII)"),
            ("R8", "Eastern Visayas (Region VIII)"),
            ("R9", "Zamboanga Peninsula (Region IX)"),
            ("R10", "Northern Mindanao (Region X)"),
            ("R11", "Davao Region (Region XI)"),
            ("R12", "SOCCSKSARGEN (Region XII)"),
            ("R13", "Caraga (Region XIII)"),
            ("BARMM", "Bangsamoro (BARMM)"),
        ]),
    },
}

def get_country_meta(code: str) -> CountryMeta:
    """Return metadata for a country code, falling back to a sane generic shape
    so the front-end never has to do null-checks.

    When a JSON overlay produced by the gem-gallery-193 monthly sync exists,
    its state list overrides the curated one for any country it knows about.
    The dial code / state label / phone format stay as curated values (those
    aren't present in the gem-gallery dataset).
    """
    if not code:
        code = "AU"
    code = code.upper()
    base = COUNTRY_META.get(code)
    overlay = _load_overlay_states().get(code)
    if base and overlay:
        merged: CountryMeta = dict(base)  # type: ignore[assignment]
        merged["states"] = overlay
        return merged
    if base:
        return base
    if overlay:
        return {
            "dial_code": "",
            "state_label": "State / Region",
            "phone_format": "### ### ####",
            "states": overlay,
        }
    return {
        "dial_code": "",
        "state_label": "State / Region",
        "phone_format": "### ### ####",
        "states": [],
    }


# ---------------------------------------------------------------------------
# Overlay loader — pulls in any state lists produced by the monthly
# gem-gallery-193 sync (``_countries_overlay.json``). Failures are swallowed
# silently so a malformed overlay never breaks the dropdown.
# ---------------------------------------------------------------------------
_OVERLAY_PATH = __import__("pathlib").Path(__file__).resolve().parent / "_countries_overlay.json"
_OVERLAY_CACHE: Dict[str, List[StateEntry]] | None = None
_OVERLAY_MTIME: float = 0.0


def _load_overlay_states() -> Dict[str, List[StateEntry]]:
    global _OVERLAY_CACHE, _OVERLAY_MTIME
    try:
        st = _OVERLAY_PATH.stat()
    except FileNotFoundError:
        _OVERLAY_CACHE = {}
        _OVERLAY_MTIME = 0.0
        return _OVERLAY_CACHE
    if _OVERLAY_CACHE is not None and st.st_mtime == _OVERLAY_MTIME:
        return _OVERLAY_CACHE
    import json as _json
    try:
        data = _json.loads(_OVERLAY_PATH.read_text())
    except Exception:
        _OVERLAY_CACHE = {}
        _OVERLAY_MTIME = st.st_mtime
        return _OVERLAY_CACHE
    out: Dict[str, List[StateEntry]] = {}
    for iso, payload in (data.get("countries") or {}).items():
        states = payload.get("states") or []
        cleaned: List[StateEntry] = []
        for s in states:
            if not isinstance(s, dict):
                continue
            name = s.get("name") or ""
            code = s.get("code") or ""
            if name:
                cleaned.append({"code": code or name[:3].upper(), "name": name})
        if cleaned:
            out[iso.upper()] = cleaned
    _OVERLAY_CACHE = out
    _OVERLAY_MTIME = st.st_mtime
    return out


def reset_overlay_cache() -> None:
    """Force the next ``get_country_meta`` call to reload the overlay from disk.
    Invoked by the monthly sync once it has rewritten the JSON file."""
    global _OVERLAY_CACHE, _OVERLAY_MTIME
    _OVERLAY_CACHE = None
    _OVERLAY_MTIME = 0.0
