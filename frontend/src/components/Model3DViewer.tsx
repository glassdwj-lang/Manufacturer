/**
 * Cross-platform 3D model preview.
 *
 * On web: renders an <iframe srcDoc=...> with a small standalone viewer
 *         page that lazy-loads @google/model-viewer (for .glb/.gltf) or
 *         three.js + STLLoader (for .stl).
 * On native: same HTML, hosted inside a react-native-webview instance.
 *
 * Unsupported formats render a friendly fallback message inside the viewer.
 */
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

const VIEWER_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #0A0A0A; overflow: hidden; }
  #stage { width: 100vw; height: 100vh; display: block; }
  model-viewer { width: 100%; height: 100%; background: #0A0A0A; --poster-color: #0A0A0A; }
  .fallback {
    color: #A3A3A3;
    font-family: -apple-system, system-ui, sans-serif;
    font-size: 13px;
    padding: 24px;
    text-align: center;
    line-height: 1.5;
  }
  .fallback strong { color: #B87333; letter-spacing: 2px; font-size: 11px; display: block; margin-bottom: 8px; }
  .err { color: #C8553D; padding: 16px; font-family: sans-serif; font-size: 12px; }
</style>
</head>
<body>
<div id="stage"></div>
<script>
(function () {
  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }
  function ext(url) {
    try {
      var clean = (url || "").split("?")[0].split("#")[0];
      var i = clean.lastIndexOf(".");
      return i >= 0 ? clean.slice(i + 1).toLowerCase() : "";
    } catch (_) { return ""; }
  }
  function load(src, type) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      if (type) s.type = type;
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function (e) { reject(e); };
      document.head.appendChild(s);
    });
  }
  var stage = document.getElementById("stage");
  var url = param("url");
  if (!url) {
    stage.innerHTML = '<div class="err">Missing url</div>';
    return;
  }
  var e = ext(url);
  if (e === "glb" || e === "gltf") {
    // model-viewer handles glb/gltf out of the box.
    load("https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js", "module")
      .then(function () {
        var mv = document.createElement("model-viewer");
        mv.setAttribute("src", url);
        mv.setAttribute("camera-controls", "");
        mv.setAttribute("touch-action", "pan-y");
        mv.setAttribute("auto-rotate", "");
        mv.setAttribute("auto-rotate-delay", "0");
        mv.setAttribute("rotation-per-second", "20deg");
        mv.setAttribute("shadow-intensity", "1");
        mv.setAttribute("exposure", "0.95");
        mv.setAttribute("environment-image", "neutral");
        stage.appendChild(mv);
      })
      .catch(function (err) {
        stage.innerHTML = '<div class="err">Failed to load model-viewer: ' + err + '</div>';
      });
  } else if (e === "stl") {
    // Three.js + STLLoader pipeline for binary/ASCII STL files.
    // We pin to 0.144.0 - the last version that still ships the legacy
    // examples/js/ (UMD) loaders. From 0.150+ those files are gone and
    // only ES-module variants under examples/jsm/ remain, which can't
    // be loaded via a plain <script> tag.
    var THREE_VER = "0.144.0";
    load("https://cdn.jsdelivr.net/npm/three@" + THREE_VER + "/build/three.min.js")
      .then(function () {
        return load("https://cdn.jsdelivr.net/npm/three@" + THREE_VER + "/examples/js/loaders/STLLoader.js");
      })
      .then(function () {
        return load("https://cdn.jsdelivr.net/npm/three@" + THREE_VER + "/examples/js/controls/OrbitControls.js");
      })
      .then(function () {
        var scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0A0A0A);
        var w = window.innerWidth, h = window.innerHeight;
        var camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
        camera.position.set(0, 0, 200);
        var renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(w, h);
        stage.appendChild(renderer.domElement);
        // Soft 3-point lighting.
        var hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.65);
        scene.add(hemi);
        var key = new THREE.DirectionalLight(0xffffff, 0.85);
        key.position.set(1, 1, 1);
        scene.add(key);
        var fill = new THREE.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-1, 0.5, -1);
        scene.add(fill);
        var controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        var loader = new THREE.STLLoader();
        loader.load(
          url,
          function (geometry) {
            geometry.center();
            geometry.computeBoundingSphere();
            var radius = geometry.boundingSphere ? geometry.boundingSphere.radius : 50;
            // Neutral matte silver — matches how CAD viewers (Solidworks,
            // Fusion 360, Blender STL preview) display untextured STL
            // geometry by default. Keeps the model legible without forcing
            // an arbitrary material onto the part.
            var material = new THREE.MeshStandardMaterial({
              color: 0xC0C0C0,
              metalness: 0.4,
              roughness: 0.55,
            });
            var mesh = new THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            scene.add(mesh);
            camera.position.set(radius * 2.0, radius * 1.5, radius * 2.0);
            controls.target.set(0, 0, 0);
            controls.update();
          },
          undefined,
          function (err) {
            stage.innerHTML = '<div class="err">Failed to load STL: ' + err + '</div>';
          }
        );
        function tick() {
          requestAnimationFrame(tick);
          controls.update();
          renderer.render(scene, camera);
        }
        tick();
        window.addEventListener("resize", function () {
          var W = window.innerWidth, H = window.innerHeight;
          renderer.setSize(W, H);
          camera.aspect = W / H;
          camera.updateProjectionMatrix();
        });
      })
      .catch(function (err) {
        stage.innerHTML = '<div class="err">Failed to load STL viewer: ' + err + '</div>';
      });
  } else {
    stage.innerHTML =
      '<div class="fallback">' +
      '<strong>3D PREVIEW UNAVAILABLE</strong>' +
      '.' + (e || "?") + ' files cannot be rendered in-app yet. ' +
      'Tap the download icon to open this file in its native CAD tool.' +
      '</div>';
  }
})();
</script>
</body>
</html>`;

export function Model3DViewer({ url }: { url: string }) {
  if (Platform.OS === "web") {
    // On web we just use a regular iframe with srcDoc so the script can
    // access location.search. We mutate the URL by appending ?url=...
    // through srcDoc preprocessing.
    const html = VIEWER_HTML.replace(
      "(function () {",
      `(function () { Object.defineProperty(window, 'location_search_override', { value: ${JSON.stringify(
        `?url=${encodeURIComponent(url)}`,
      )}, writable: false });`,
    ).replace(
      "new URLSearchParams(location.search)",
      "new URLSearchParams(window.location_search_override || location.search)",
    );
    // @ts-ignore — iframe is web-only; RN-Web maps it correctly.
    return (
      <View style={styles.wrap}>
        {React.createElement("iframe", {
          srcDoc: html,
          style: {
            border: 0,
            width: "100%",
            height: "100%",
            background: "#0A0A0A",
          },
          sandbox: "allow-scripts allow-same-origin",
          title: "3D preview",
        })}
      </View>
    );
  }

  // Native: WebView with injected html. We append the url through
  // injectedJavaScriptBeforeContentLoaded for the script to read.
  const inject = `window.__viewer_url = ${JSON.stringify(url)}; true;`;
  const nativeHtml = VIEWER_HTML.replace(
    "new URLSearchParams(location.search).get(name)",
    "(name === 'url' ? window.__viewer_url : new URLSearchParams(location.search).get(name))",
  );
  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html: nativeHtml, baseUrl: "https://localhost/" }}
        injectedJavaScriptBeforeContentLoaded={inject}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0A0A0A" },
  web: { flex: 1, backgroundColor: "#0A0A0A" },
});

const PREVIEW_EXTS = new Set(["glb", "gltf", "stl"]);
export function isPreviewable(filename: string | undefined | null): boolean {
  if (!filename) return false;
  const i = filename.lastIndexOf(".");
  if (i < 0) return false;
  return PREVIEW_EXTS.has(filename.slice(i + 1).toLowerCase());
}
