/* Asistente académico — portafolio de Inga Sanchez Jordan (UPLA)
   Se enlaza desde index.html con:  <script src="asistente.js" defer></script>
   Lee tus páginas (.page), responde con IA mediante tu Worker de Cloudflare
   y, si la IA no está disponible, busca localmente en tu portafolio. */
(() => {
  /* ===== CONFIGURA AQUÍ ===== */
  const CONFIG = {
    endpoint: "https://asistente-portafolio.ingasanchezjordan268.workers.dev",,   // URL de tu Worker de Cloudflare
    nombre: "Asistente académico",
    subtitulo: "Portafolio · UPLA",
    saludo: "¡Hola! Soy el asistente de este portafolio. Puedo contarte sobre las unidades, las semanas y las actividades publicadas, explicarte conceptos como pilas, colas o listas enlazadas, y ayudarte a estudiar. ¿Qué quieres saber?",
    chips: ["¿Qué unidades hay?", "Actividades publicadas", "Explícame las pilas"],
    extra: window.PORTAFOLIO_KB || []            // [{title,text}] para añadir sílabos u otros textos
  };
  /* ========================== */

  // ---------- Robot flotante (SVG) ----------
  const ROBOT = `<svg viewBox="0 0 100 122" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <line x1="50" y1="14" x2="50" y2="24" stroke="#8fb0cc" stroke-width="3" stroke-linecap="round"/>
    <circle class="ac-ant" cx="50" cy="10" r="5" fill="#ffa24d"/>
    <rect x="12" y="38" width="8" height="16" rx="4" fill="#ffa24d"/>
    <rect x="80" y="38" width="8" height="16" rx="4" fill="#ffa24d"/>
    <rect x="18" y="24" width="64" height="46" rx="18" fill="#e3effb" stroke="#1f4a6e" stroke-width="2"/>
    <rect x="26" y="32" width="48" height="30" rx="12" fill="#081628"/>
    <ellipse class="ac-eye" cx="40" cy="46" rx="5" ry="6" fill="#6fd0e8"/>
    <ellipse class="ac-eye" cx="60" cy="46" rx="5" ry="6" fill="#6fd0e8"/>
    <path d="M44 55 Q50 60 56 55" stroke="#6fd0e8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <rect x="31" y="74" width="38" height="26" rx="11" fill="#e3effb" stroke="#1f4a6e" stroke-width="2"/>
    <circle cx="50" cy="87" r="5" fill="#ffa24d"/>
    <circle cx="24" cy="86" r="7" fill="#b9d3ee" stroke="#1f4a6e" stroke-width="2"/>
    <circle cx="76" cy="86" r="7" fill="#b9d3ee" stroke="#1f4a6e" stroke-width="2"/>
    <path class="ac-flame" d="M42 102 Q50 118 58 102 Z" fill="#ffa24d" opacity=".9"/>
  </svg>`;

  // ---------- Crear el chat en la página ----------
  const root = document.createElement("div");
  root.className = "ac-root"; root.id = "ac-root";
  root.innerHTML = `
    <div class="ac-panel" role="dialog" aria-label="Asistente académico">
      <div class="ac-head">
        <div class="ac-avatar" data-avatar></div>
        <div><h2 data-nombre></h2><small data-sub></small></div>
        <button class="ac-x" aria-label="Cerrar" data-close>✕</button>
      </div>
      <div class="ac-bar" data-bar><span><i></i><b data-estado style="font-weight:400">Asistente con IA</b></span>
        <button class="ac-reset" aria-label="Reiniciar chat" data-reset>↻</button></div>
      <div class="ac-log" data-log aria-live="polite"></div>
      <div class="ac-chips" data-chips></div>
      <form class="ac-form" data-form>
        <input data-input placeholder="Escríbeme lo que quieras…" autocomplete="off" maxlength="500" aria-label="Tu pregunta">
        <button aria-label="Enviar" data-send>➜</button>
      </form>
      <div class="ac-foot">Responde con IA usando tu portafolio · Puede equivocarse</div>
    </div>
    <button class="ac-launch" aria-label="Abrir asistente" data-open></button>`;
  document.body.append(root);

  const $ = s => root.querySelector(s);
  const log = $("[data-log]"), input = $("[data-input]"), sendBtn = $("[data-send]");
  let historial = [], ocupado = false;

  // ---------- Búsqueda local (elige el contexto que se envía a la IA) ----------
  const STOP = new Set("el la los las un una unos unas de del al y o u en a por para con sin que es son se lo su sus mi me te tu como cual cuales qué quien donde cuando hay sobre este esta esto ese esa eso muy mas ya ni si no".split(" "));
  const norm = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const stem = w => w.length > 5 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w;
  const tokens = s => norm(s).split(/[^a-z0-9ñ]+/).filter(w => (w.length > 1 || /\d/.test(w)) && !STOP.has(w)).map(stem);
  const limpio = s => (s || "").replace(/\s+/g, " ").trim();
  const txt = (el, sel) => limpio(el.querySelector(sel)?.textContent);

  let chunks = [], mapa = "";
  function add(title, text, el, pageId) {
    title = limpio(title); text = limpio(text).slice(0, 1500);
    if (title) chunks.push({ title, text, el, pageId, tt: tokens(title), bt: tokens(text) });
  }

  // Lee TU portafolio: cada .page y cada .work-item se vuelven fragmentos buscables
  function indexar() {
    chunks = [];
    const datos = [...document.querySelectorAll(".hd-name,.hd-item")].map(e => limpio(e.textContent)).join(", ");
    const inicio = document.getElementById("page-inicio");
    add("Datos del estudiante y del curso",
      `Portafolio estudiantil de ${datos}. ${txt(document, ".brand-name")}, ${txt(document, ".brand-sub")}. ` +
      `Curso: ${txt(document, ".course-title")}. ${txt(document, ".hero-desc")}`, inicio, "page-inicio");

    document.querySelectorAll("main.page").forEach(pg => {
      if (pg.id === "page-inicio") return;
      const eyebrow = txt(pg, ".eyebrow"), h2 = txt(pg, "h2");
      const label = [eyebrow, h2].filter(Boolean).join(" — ");
      const items = [...pg.querySelectorAll(".work-item")];
      if (items.length) {
        add(label, `Trabajos entregados: ${items.map(w => txt(w, ".work-title")).join(", ")}. Total: ${items.length} actividades.`, pg, pg.id);
        items.forEach(w => {
          const t = txt(w, ".work-title"), d = txt(w, ".work-desc"), s = txt(w, ".work-stack");
          const ev = w.querySelector(".file-btn--image") ? " Incluye evidencia en imagen." : "";
          const doc = w.querySelector(".file-btn--pdf") ? " Incluye documento o código." : "";
          add(`${eyebrow} · ${t}`, `${label}. ${t}: ${d}. Tecnología o estado: ${s}.${ev}${doc}`, w, pg.id);
        });
      } else {
        const c = pg.cloneNode(true);
        c.querySelectorAll(".back-btn,footer").forEach(e => e.remove());
        add(label || pg.id, c.textContent, pg, pg.id);
      }
    });
    CONFIG.extra.forEach(k => add(k.title, k.text, null, null));

    const df = {};
    chunks.forEach(c => new Set(c.tt.concat(c.bt)).forEach(t => df[t] = (df[t] || 0) + 1));
    chunks.forEach(c => c.df = df);

    // Mapa compacto de todo el portafolio: se envía siempre a la IA
    const unidades = [...document.querySelectorAll("#page-unidades .option-title")].map(e => limpio(e.textContent)).join("; ");
    const semanas = [...document.querySelectorAll("main.page")].filter(p => p.querySelector(".work-item")).map(p => {
      const n = p.querySelectorAll(".work-item").length;
      const st = [...new Set([...p.querySelectorAll(".work-stack")].map(x => limpio(x.textContent)))].join("/");
      return `${txt(p, ".eyebrow")}: ${n} actividades (${st})`;
    }).join("; ");
    mapa = `Unidades del curso: ${unidades}. Actividades por semana: ${semanas}.`;
  }

  function buscar(q) {
    const qt = [...new Set(tokens(q))];
    if (!qt.length) return [];
    const N = chunks.length || 1;
    const hit = (arr, t) => arr.filter(x => x === t || (t.length > 3 && (x.startsWith(t) || t.startsWith(x)))).length;
    return chunks.map(c => {
      let s = 0;
      qt.forEach(t => s += Math.log(1 + N / ((c.df[t] || 0) + 0.5)) * (3 * Math.min(hit(c.tt, t), 1) + Math.min(hit(c.bt, t), 4) * 0.8));
      return { c, s };
    }).filter(r => r.s > 0).sort((a, b) => b.s - a.s);
  }

  // ---------- Mensajes ----------
  const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function fmt(t) {
    return esc(t).split(/```[a-z]*\n?/).map((p, i) => i % 2
      ? `<pre><code>${p.replace(/\n$/, "")}</code></pre>`
      : p.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`\n]+)`/g, "<code>$1</code>")).join("");
  }
  function msg(text, who, link) {
    const d = document.createElement("div");
    d.className = "ac-msg " + who;
    who === "bot" ? d.innerHTML = fmt(text) : d.textContent = text;
    if (link) {
      const a = document.createElement("a");
      a.textContent = link.label; a.tabIndex = 0; a.onclick = link.go;
      a.onkeydown = e => e.key === "Enter" && link.go();
      d.append(document.createElement("br"), a);
    }
    log.append(d); log.scrollTop = log.scrollHeight;
    return d;
  }

  // Lleva al visitante a la página correcta usando TU función goTo()
  function irA(c) {
    if (c.pageId && typeof goTo === "function") goTo(c.pageId);
    if (c.el && c.el.id !== c.pageId) {
      requestAnimationFrame(() => {
        c.el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth", block: "center" });
        c.el.classList.add("ac-flash"); setTimeout(() => c.el.classList.remove("ac-flash"), 2200);
      });
    }
    if (innerWidth < 700) root.classList.remove("open");
  }
  const enlaceA = r => r && r.s > 3 && r.c.pageId ? { label: "Ir a: " + r.c.title.slice(0, 55), go: () => irA(r.c) } : null;

  // ---------- Respuesta de la IA ----------
  async function preguntarIA(q) {
    const ctx = buscar(q).slice(0, 5);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 30000);
    try {
      const r = await fetch(CONFIG.endpoint, {
        method: "POST", signal: ctl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: historial.slice(-8),
          context: ctx.map(x => ({ title: x.c.title, text: x.c.text })),
          index: mapa
        })
      });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (!j.reply) throw new Error("vacío");
      return { texto: j.reply, ctx };
    } finally { clearTimeout(to); }
  }

  function respuestaLocal(q) {
    const r = buscar(q);
    if (!r.length) return { texto: "No encontré eso en el portafolio. Prueba con: “Unidad 2”, “Semana 6” o “Pilas”.", r };
    const m = r[0].c;
    return { texto: m.title + "\n" + m.text.slice(0, 300), r };
  }

  async function enviar(q) {
    q = q.trim();
    if (!q || ocupado) return;
    ocupado = true; sendBtn.disabled = true;
    msg(q, "me");
    historial.push({ role: "user", content: q });
    const typing = document.createElement("div");
    typing.className = "ac-msg bot ac-dots"; typing.innerHTML = "<span></span><span></span><span></span>";
    log.append(typing); log.scrollTop = log.scrollHeight;
    try {
      const { texto, ctx } = await preguntarIA(q);
      typing.remove();
      msg(texto, "bot", enlaceA(ctx[0]));
      historial.push({ role: "assistant", content: texto });
      estado(true);
    } catch (e) {
      typing.remove();
      const { texto, r } = respuestaLocal(q);
      msg(texto, "bot", enlaceA(r[0]));
      historial.push({ role: "assistant", content: texto });
      estado(false);
    }
    ocupado = false; sendBtn.disabled = false; input.focus();
  }

  function estado(ok) {
    $("[data-bar]").classList.toggle("off", !ok);
    $("[data-estado]").textContent = ok ? "Asistente con IA" : "Sin conexión con la IA · usando búsqueda local";
  }
  function reiniciar() { log.innerHTML = ""; historial = []; msg(CONFIG.saludo, "bot"); }

  // ---------- Arranque ----------
  $("[data-avatar]").innerHTML = ROBOT; $("[data-open]").innerHTML = ROBOT;
  $("[data-nombre]").textContent = CONFIG.nombre; $("[data-sub]").textContent = CONFIG.subtitulo;
  CONFIG.chips.forEach(t => {
    const b = document.createElement("button");
    b.className = "ac-chip"; b.type = "button"; b.textContent = t; b.onclick = () => enviar(t);
    $("[data-chips]").append(b);
  });
  $("[data-open]").onclick = () => { root.classList.toggle("open"); input.focus(); };
  $("[data-close]").onclick = () => root.classList.remove("open");
  $("[data-reset]").onclick = reiniciar;
  $("[data-form]").onsubmit = e => { e.preventDefault(); const v = input.value; input.value = ""; enviar(v); };
  document.addEventListener("keydown", e => e.key === "Escape" && root.classList.remove("open"));

  reiniciar();
  indexar();
})();
