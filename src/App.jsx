import { useState, useRef, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 🗄️  SUPABASE — cliente ultra-leve (sem SDK, usa REST + fetch)
// Configure na aba "Supabase" do ADM. Até lá, o app usa dados locais.
// ─────────────────────────────────────────────────────────────────────────────
const SUPA_URL = "https://klhcrhlpumyhuwevseif.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsaGNyaGxwdW15aHV3ZXZzZWlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzkyMjgsImV4cCI6MjA4ODg1NTIyOH0.-0RZS18bkecEM8FEOhmwswamGYkEdlyUMovGSAY_POk";
const getSupaCfg = () => { try { const s = localStorage.getItem("v9_supa"); return s ? JSON.parse(s) : { url: SUPA_URL, key: SUPA_KEY }; } catch { return { url: SUPA_URL, key: SUPA_KEY }; } };
const saveSupaCfg = (url, key) => { try { localStorage.setItem("v9_supa", JSON.stringify({ url: url.replace(/\/$/, ""), key })); } catch {} };

const supaFetch = async (table, method = "GET", body = null, filter = "", cfg = null) => {
  const c = cfg || getSupaCfg();
  if (!c?.url || !c?.key) return null;
  const url = `${c.url}/rest/v1/${table}${filter ? "?" + filter : ""}`;
  const headers = {
    "Content-Type": "application/json",
    "apikey": c.key,
    "Authorization": `Bearer ${c.key}`,
    "Prefer": "return=representation",
  };
  try {
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) { console.warn("Supabase error:", res.status, text); return null; }
    if (!text || text === "null") return method === "DELETE" ? true : [];
    return JSON.parse(text);
  } catch (e) {
    if (e.message?.includes("Failed to fetch") || e.message?.includes("CORS") || e.name === "TypeError") {
      return "cors_blocked";
    }
    console.warn("Supabase fetch error:", e);
    return null;
  }
};

// Upload de imagem para o Supabase Storage (bucket "wines")
const supaUploadImage = async (base64, wineId, cfg) => {
  const c = cfg || getSupaCfg();
  if (!c?.url || !c?.key || !base64) return null;
  try {
    // Converte base64 para Blob
    const [meta, data] = base64.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const fileName = `wine_${wineId}_${Date.now()}.${ext}`;
    const uploadUrl = `${c.url}/storage/v1/object/wines/${fileName}`;
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { "apikey": c.key, "Authorization": `Bearer ${c.key}`, "Content-Type": mime, "x-upsert": "true" },
      body: blob,
    });
    if (!res.ok) { console.warn("Storage upload error:", res.status, await res.text()); return null; }
    // Retorna URL pública
    return `${c.url}/storage/v1/object/public/wines/${fileName}`;
  } catch (e) {
    console.warn("Storage upload exception:", e);
    return null;
  }
};

// Remove imagem do Supabase Storage
const supaDeleteImage = async (imgUrl, cfg) => {
  const c = cfg || getSupaCfg();
  if (!c?.url || !c?.key || !imgUrl) return;
  try {
    const path = imgUrl.split("/storage/v1/object/public/wines/")[1];
    if (!path) return;
    await fetch(`${c.url}/storage/v1/object/wines/${path}`, {
      method: "DELETE",
      headers: { "apikey": c.key, "Authorization": `Bearer ${c.key}` },
    });
  } catch {}
};

// Helpers por tabela
const supa = {
  wines:     { list: (c) => supaFetch("wines", "GET", null, "order=name", c),
               insert: (w, c) => supaFetch("wines", "POST", w, "", c),
               update: (w, c) => supaFetch("wines", "PATCH", w, `id=eq.${w.id}`, c),
               delete: (id, c) => supaFetch("wines", "DELETE", null, `id=eq.${id}`, c) },
  orders:    { list: (c) => supaFetch("orders", "GET", null, "order=created_at.desc", c),
               insert: (o, c) => supaFetch("orders", "POST", o, "", c),
               update: (o, c) => supaFetch("orders", "PATCH", o, `id=eq.${o.id}`, c) },
  customers: { list: (c) => supaFetch("customers", "GET", null, "order=name", c),
               insert: (cu, c) => supaFetch("customers", "POST", cu, "", c) },
  reviews:   { list: (c) => supaFetch("reviews", "GET", null, "order=created_at.desc", c),
               insert: (r, c) => supaFetch("reviews", "POST", r, "", c),
               update: (r, c) => supaFetch("reviews", "PATCH", r, `id=eq.${r.id}`, c),
               delete: (id, c) => supaFetch("reviews", "DELETE", null, `id=eq.${id}`, c) },
};

const INITIAL_WINES = [];

const SALES_DATA = [
  { month: "Jan", revenue: 0, cost: 0, orders: 0 },
  { month: "Fev", revenue: 0, cost: 0, orders: 0 },
  { month: "Mar", revenue: 0, cost: 0, orders: 0 },
  { month: "Abr", revenue: 0, cost: 0, orders: 0 },
  { month: "Mai", revenue: 0, cost: 0, orders: 0 },
  { month: "Jun", revenue: 0, cost: 0, orders: 0 },
];

const INITIAL_ORDERS = [];

const INITIAL_REVIEWS = [];

const INITIAL_BANNERS = [
  { id: 1, title: "Semana do Champagne", subtitle: "Espumantes franceses com até 20% OFF", cta: "Ver Ofertas", bg: "linear-gradient(135deg,#1a1000 0%,#2a1500 50%,#1a0a00 100%)", accent: "#fbbf24", tag: "PROMOÇÃO", active: true, targetFilter: "Espumante" },
  { id: 2, title: "Novos Rótulos Italianos", subtitle: "Super Toscanos e Barolo recém chegados", cta: "Descobrir", bg: "linear-gradient(135deg,#0a1520 0%,#0f1f35 50%,#0a1020 100%)", accent: "#60a5fa", tag: "NOVIDADE", active: true, targetFilter: "Tinto" },
  { id: 3, title: "Clube Vinhos9", subtitle: "Assine e receba 3 rótulos exclusivos por mês", cta: "Quero Assinar", bg: "linear-gradient(135deg,#1a0a1a 0%,#2a1035 50%,#150a15 100%)", accent: "#c084fc", tag: "CLUBE", active: false, targetFilter: null },
];

const INITIAL_HIGHLIGHT_WINES = [1, 2, 4, 5, 6];

const INITIAL_HERO_BANNER = {
  tag: "Coleção Exclusiva",
  title: "Vinhos Importados",
  titleAccent: "de Excelência",
  subtitle: "Curadoria especial das melhores regiões vinícolas do mundo.",
  ctaLabel: "Explorar Catálogo",
  imgDesktop: null, // imagem de fundo desktop (recomendado 1920×600px)
  imgMobile: null,  // imagem de fundo mobile (recomendado 768×500px)
};

const MOCK_CLIENT = {
  name: "Ana Souza",
  email: "ana.souza@email.com",
  phone: "(11) 99999-0000",
  since: "Janeiro 2025",
  tier: "Gold",
  points: 2840,
  orders: [
    { id: "#0038", date: "15/01/2026", wines: ["Château Margaux × 1", "Veuve Clicquot × 1"], total: 1300, status: "Entregue" },
    { id: "#0041", date: "08/03/2026", wines: ["Château Margaux × 2"], total: 1780, status: "Entregue" },
    { id: "#0046", date: "11/03/2026", wines: ["Cloudy Bay Sauvignon × 2", "Kim Crawford Rosé × 1"], total: 477, status: "Em trânsito" },
  ],
  wishlist: [2, 4, 6], // wine IDs
  savedCoupons: ["VINO10", "BEMVINDO"],
};

const CATEGORIES = ["Todos", "Tinto", "Branco", "Espumante", "Rosé"];

const HARMONIZATION = {
  Tinto: ["🥩 Carnes vermelhas", "🧀 Queijos curados", "🍄 Cogumelos", "🫙 Embutidos"],
  Branco: ["🐟 Peixes e frutos do mar", "🐔 Aves grelhadas", "🧀 Queijos frescos", "🥗 Saladas"],
  Espumante: ["🦞 Lagosta e camarão", "🎂 Sobremesas leves", "🧀 Queijo brie", "🥂 Petiscos"],
  Rosé: ["🍓 Frutas vermelhas", "🐷 Porco", "🥗 Salada Niçoise", "🍕 Pizza napolitana"],
};

const PAYMENT_GATEWAYS = {
  mercadopago: { name: "Mercado Pago", icon: "💳", fields: ["publicKey","accessToken"] },
  pagseguro:   { name: "PagSeguro",   icon: "🔒", fields: ["email","token"] },
  stripe:      { name: "Stripe",      icon: "⚡", fields: ["publishableKey","secretKey"] },
  pagarme:     { name: "Pagar.me",    icon: "💰", fields: ["apiKey","cryptoKey"] },
  cielo:       { name: "Cielo",       icon: "🏦", fields: ["merchantId","merchantKey"] },
};

// 🔐 Hash simples (djb2) — nunca armazena senha em texto puro
const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i); return (h >>> 0).toString(36); };
// Credenciais padrão: admin / vinhos9adm  — troque pela aba "Segurança" no ADM
const DEFAULT_ADM_HASH = { user: hashStr("admin"), pass: hashStr("vinhos9adm") };
const getAdmHash = () => { try { const s = localStorage.getItem("v9_adm"); return s ? JSON.parse(s) : DEFAULT_ADM_HASH; } catch { return DEFAULT_ADM_HASH; } };
const saveAdmHash = (user, pass) => { try { localStorage.setItem("v9_adm", JSON.stringify({ user: hashStr(user), pass: hashStr(pass) })); } catch {} };

// 🔐 Rate limiter simples para login ADM
const loginAttempts = { count: 0, lockedUntil: 0 };
const checkRateLimit = () => {
  if (Date.now() < loginAttempts.lockedUntil) {
    const secs = Math.ceil((loginAttempts.lockedUntil - Date.now()) / 1000);
    return `Muitas tentativas. Aguarde ${secs}s.`;
  }
  return null;
};
const registerFailedAttempt = () => {
  loginAttempts.count += 1;
  if (loginAttempts.count >= 5) { loginAttempts.lockedUntil = Date.now() + 60000; loginAttempts.count = 0; }
};

const fmt = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const discountPct = (orig, promo) => Math.round(((orig - promo) / orig) * 100);
const margin = (cost, sale) => sale > 0 && cost >= 0 ? (((sale - cost) / sale) * 100).toFixed(1) : "0.0";
const profit = (cost, sale) => Math.max(0, sale - cost);

const Stars = ({ rating }) => (
  <span style={{ color: "#f59e0b", fontSize: 12 }}>
    {"★".repeat(Math.floor(rating))}{"☆".repeat(5 - Math.floor(rating))}
    <span style={{ color: "#a09080", fontSize: 10, marginLeft: 4 }}>{rating}</span>
  </span>
);

const MarginBadge = ({ pct }) => {
  const p = parseFloat(pct);
  const color = p >= 35 ? "#4ade80" : p >= 20 ? "#fbbf24" : "#f87171";
  const bg = p >= 35 ? "#1a3a1a" : p >= 20 ? "#2a2510" : "#3a1010";
  return <span style={{ background: bg, color, padding: "2px 8px", borderRadius: 10, fontSize: 10 }}>{pct}%</span>;
};

const LowStockBadge = ({ stock }) => {
  if (stock > 3) return null;
  if (stock === 0) return <span style={{ background: "#1a0a0a", color: "#f87171", border: "1px solid #7f1d1d", padding: "2px 7px", borderRadius: 4, fontSize: 9, letterSpacing: 1 }}>ESGOTADO</span>;
  return <span style={{ background: "#2a1505", color: "#fb923c", border: "1px solid #7c2d12", padding: "2px 7px", borderRadius: 4, fontSize: 9, letterSpacing: 1 }}>🔥 Últimas {stock} un.</span>;
};

// Garrafa genérica SVG 1:1
const BottlePlaceholder = ({ size = 80, name = "" }) => (
  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#2a1010,#1a0808)" }}>
    <svg width={size * 0.45} height={size * 0.85} viewBox="0 0 44 100" fill="none">
      <rect x="16" y="0" width="12" height="8" rx="2" fill="#5a3a3a" />
      <rect x="14" y="8" width="16" height="6" rx="1" fill="#6b4040" />
      <path d="M12 14 C8 22 6 30 6 42 L6 88 C6 94 10 98 22 98 C34 98 38 94 38 88 L38 42 C38 30 36 22 32 14 Z" fill="#2d1515" />
      <path d="M12 14 C8 22 6 30 6 42 L6 88 C6 94 10 98 22 98 C34 98 38 94 38 88 L38 42 C38 30 36 22 32 14 Z" fill="url(#bg2)" />
      <rect x="10" y="50" width="24" height="24" rx="2" fill="rgba(245,240,232,0.07)" />
      <text x="22" y="59" textAnchor="middle" fill="rgba(245,240,232,0.45)" fontSize="4" fontFamily="Georgia,serif">VINHOS9</text>
      <text x="22" y="67" textAnchor="middle" fill="rgba(245,240,232,0.3)" fontSize="3" fontFamily="Georgia,serif">{name.slice(0, 12)}</text>
      <defs>
        <linearGradient id="bg2" x1="6" y1="14" x2="38" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8b2c2c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#1a0505" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  </div>
);

// Thumb quadrado 1024x1024 display
const WineThumb = ({ wine, size = "100%", height = "100%" }) => (
  <div style={{ width: size, height, position: "relative", overflow: "hidden", background: "#1a0808" }}>
    {wine.img
      ? <img src={wine.img} alt={wine.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
      : <BottlePlaceholder size={typeof height === "number" ? height * 0.7 : 80} name={wine.name} />}
  </div>
);

// ── MiniCard ──────────────────────────────────────────────────────────────────
const MiniCard = ({ wine, onClick }) => {
  const activePrice = wine.promoPrice || wine.price;
  return (
    <div onClick={() => onClick(wine)} style={{ cursor: "pointer", background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, overflow: "hidden", transition: "all .25s", flexShrink: 0, width: 160 }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(139,44,44,.3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
      <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
        <WineThumb wine={wine} height="100%" />
        {wine.promoPrice && <span style={{ position: "absolute", top: 8, left: 8, background: "#b45309", color: "#fef3c7", fontSize: 9, padding: "2px 7px", borderRadius: 3, fontWeight: "bold", letterSpacing: 1 }}>-{discountPct(wine.price, wine.promoPrice)}%</span>}
        <span style={{ position: "absolute", top: 8, right: 8, background: "#8b2c2c", color: "#fff", fontSize: 8, padding: "2px 6px", borderRadius: 3 }}>{wine.category}</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 12, color: "#f5f0e8", fontWeight: "bold", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wine.name}</div>
        <div style={{ fontSize: 10, color: "#7a6a6a", marginBottom: 6 }}>{wine.origin} · {wine.year}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontSize: 14, color: wine.promoPrice ? "#fbbf24" : "#e8b4b4", fontWeight: "bold" }}>{fmt(activePrice)}</span>
          {wine.promoPrice && <span style={{ fontSize: 10, color: "#5a4a4a", textDecoration: "line-through" }}>{fmt(wine.price)}</span>}
        </div>
      </div>
    </div>
  );
};

// ── SkeletonCard ──────────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 12, overflow: "hidden" }}>
    <div style={{ width: "100%", aspectRatio: "1/1", background: "linear-gradient(90deg,#1a1410 25%,#2a1f1f 50%,#1a1410 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
    <div style={{ padding: "14px 14px 16px" }}>
      <div style={{ height: 14, background: "#2a1f1f", borderRadius: 4, marginBottom: 8, width: "75%", animation: "shimmer 1.4s infinite" }} />
      <div style={{ height: 10, background: "#1a1810", borderRadius: 4, marginBottom: 10, width: "50%", animation: "shimmer 1.4s infinite" }} />
      <div style={{ height: 20, background: "#2a1f1f", borderRadius: 4, width: "40%", animation: "shimmer 1.4s infinite" }} />
    </div>
  </div>
);

// ── ImageZoomModal ────────────────────────────────────────────────────────────
const ImageZoomModal = ({ wine, onClose }) => {
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,.92)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s ease", cursor: "zoom-out" }}>
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", maxWidth: 600, maxHeight: "90vh", width: "90vw", cursor: "default" }}>
        <button onClick={onClose} style={{ position: "absolute", top: -14, right: -14, zIndex: 10, background: "#8b2c2c", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        <div style={{ borderRadius: 12, overflow: "hidden", aspectRatio: "1/1" }}>
          <WineThumb wine={wine} height="100%" />
        </div>
        <div style={{ textAlign: "center", marginTop: 12, color: "#e8b4b4", fontSize: 14 }}>{wine.name} · {wine.year}</div>
        <div style={{ textAlign: "center", fontSize: 10, color: "#5a4a4a", marginTop: 3 }}>Pressione ESC ou clique fora para fechar</div>
      </div>
    </div>
  );
};

// ── Carrossel ────────────────────────────────────────────────────────────────
const Carousel = ({ items, onSelect, title, subtitle, accentColor = "#e8b4b4", autoPlay = true, visibleDesktop = 4 }) => {
  const [winWidth, setWinWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const VISIBLE = winWidth <= 768 ? 2 : visibleDesktop;
  const [index, setIndex] = useState(0);
  const [animDir, setAnimDir] = useState(null); // 'left' | 'right' | null
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef(null);
  const pausedRef = useRef(false);

  const total = items.length;
  const maxIndex = Math.max(0, total - VISIBLE);

  const go = useCallback((dir) => {
    if (animating || total <= VISIBLE) return;
    setAnimDir(dir);
    setAnimating(true);
    setTimeout(() => {
      setIndex((prev) => {
        if (dir === "right") return prev >= maxIndex ? 0 : prev + 1;
        return prev <= 0 ? maxIndex : prev - 1;
      });
      setAnimating(false);
      setAnimDir(null);
    }, 320);
  }, [animating, maxIndex, total]);

  const startTimer = useCallback(() => {
    if (!autoPlay) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!pausedRef.current) go("right");
    }, 3200);
  }, [autoPlay, go]);

  useEffect(() => {
    setIndex(0);
  }, [items.length]);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [startTimer]);

  const visibleItems = total <= VISIBLE
    ? items
    : items.slice(index, index + VISIBLE).concat(
        index + VISIBLE > total ? items.slice(0, (index + VISIBLE) % total) : []
      );

  const dotCount = Math.max(1, total - VISIBLE + 1);

  return (
    <div style={{ marginTop: 52, paddingTop: 32, borderTop: "1px solid #2a1f1f" }}
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 9, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 4 }}>{subtitle}</div>
          <h3 style={{ fontSize: 20, color: accentColor, letterSpacing: 1 }}>{title}</h3>
        </div>
        {total > VISIBLE && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Dots */}
            <div style={{ display: "flex", gap: 6 }}>
              {Array.from({ length: dotCount }).map((_, i) => (
                <button key={i} onClick={() => { if (!animating) setIndex(i); }}
                  style={{ width: i === index ? 20 : 7, height: 7, borderRadius: 4, border: "none", background: i === index ? accentColor : "#2a1f1f", cursor: "pointer", transition: "all .3s ease", padding: 0 }} />
              ))}
            </div>
            {/* Arrows */}
            <button onClick={() => go("left")}
              style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid #2a1f1f`, background: "#1a1410", color: "#a09080", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.color = accentColor; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a1f1f"; e.currentTarget.style.color = "#a09080"; }}>
              ‹
            </button>
            <button onClick={() => go("right")}
              style={{ width: 34, height: 34, borderRadius: "50%", border: `1px solid #2a1f1f`, background: "#1a1410", color: "#a09080", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = accentColor; e.currentTarget.style.color = accentColor; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a1f1f"; e.currentTarget.style.color = "#a09080"; }}>
              ›
            </button>
          </div>
        )}
      </div>

      {/* Track */}
      <div style={{ overflow: "hidden", position: "relative" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(VISIBLE, total)}, 1fr)`,
          gap: 14,
          transition: animating ? "opacity .32s ease, transform .32s ease" : "none",
          opacity: animating ? 0.5 : 1,
          transform: animating
            ? `translateX(${animDir === "right" ? "-18px" : "18px"})`
            : "translateX(0)",
        }}>
          {visibleItems.map((wine) => {
            const activePrice = wine.promoPrice || wine.price;
            return (
              <div key={wine.id + "-" + index}
                onClick={() => onSelect(wine)}
                style={{ cursor: "pointer", background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, overflow: "hidden", transition: "all .25s" }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-5px)"; e.currentTarget.style.boxShadow = "0 14px 40px rgba(139,44,44,.3)"; e.currentTarget.style.borderColor = "#3a2a2a"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = "#2a1f1f"; }}>
                {/* Imagem 1:1 */}
                <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
                  <WineThumb wine={wine} height="100%" />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 55%,rgba(12,10,9,.75))" }} />
                  {wine.promoPrice && (
                    <span style={{ position: "absolute", top: 8, left: 8, background: "#b45309", color: "#fef3c7", fontSize: 9, padding: "2px 7px", borderRadius: 3, fontWeight: "bold", letterSpacing: 1 }}>
                      -{discountPct(wine.price, wine.promoPrice)}%
                    </span>
                  )}
                  <span style={{ position: "absolute", top: 8, right: 8, background: "#8b2c2c", color: "#fff", fontSize: 8, padding: "2px 6px", borderRadius: 3 }}>{wine.category}</span>
                  <div style={{ position: "absolute", bottom: 8, left: 10, right: 10 }}>
                    <div style={{ fontSize: 9, color: "rgba(245,240,232,.55)" }}>{wine.origin} · {wine.year}</div>
                  </div>
                </div>
                {/* Info */}
                <div style={{ padding: "12px 12px 14px" }}>
                  <div style={{ fontSize: 12, color: "#f5f0e8", fontWeight: "bold", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wine.name}</div>
                  <div style={{ marginBottom: 8, fontSize: 11 }}>
                    <span style={{ color: "#f59e0b" }}>{"★".repeat(Math.floor(wine.rating))}</span>
                    <span style={{ color: "#a09080", fontSize: 10, marginLeft: 4 }}>{wine.rating}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 15, color: wine.promoPrice ? "#fbbf24" : "#e8b4b4", fontWeight: "bold" }}>{fmt(activePrice)}</span>
                    {wine.promoPrice && <span style={{ fontSize: 10, color: "#5a4a4a", textDecoration: "line-through" }}>{fmt(wine.price)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};





// WineFormFields removed — rendered inline inside App to avoid focus loss on re-render

// ── ReviewSection ─────────────────────────────────────────────────────────────
const StarPicker = ({ value, onChange, size = 24 }) => {
  const [hovered, setHovered] = useState(0);
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1,2,3,4,5].map((s) => (
        <span key={s}
          onClick={() => onChange(s)}
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          style={{ fontSize: size, cursor: "pointer", color: s <= (hovered || value) ? "#f59e0b" : "#2a1f1f", transition: "color .15s", userSelect: "none" }}>
          ★
        </span>
      ))}
    </div>
  );
};

const ReviewSection = ({ wine, reviews, setReviews, reviewedWines = new Set(), setReviewedWines = () => {}, onSubmitReview = null }) => {
  const wineReviews = reviews.filter((r) => r.wineId === wine.id && r.approved);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState({ author: "", rating: 0, comment: "" });
  const [formState, setFormState] = useState("idle"); // idle | error | success
  const [errorMsg, setErrorMsg] = useState("");

  const displayed = showAll ? wineReviews : wineReviews.slice(0, 3);

  const avgRating = wineReviews.length
    ? (wineReviews.reduce((s, r) => s + r.rating, 0) / wineReviews.length).toFixed(1)
    : null;

  const distribution = [5,4,3,2,1].map((star) => ({
    star,
    count: wineReviews.filter((r) => r.rating === star).length,
    pct: wineReviews.length ? Math.round((wineReviews.filter((r) => r.rating === star).length / wineReviews.length) * 100) : 0,
  }));

  const handleSubmit = () => {
    if (reviewedWines.has(wine.id)) { setErrorMsg("Você já enviou uma avaliação para este vinho nesta sessão."); setFormState("error"); return; }
    if (!form.author.trim()) { setErrorMsg("Por favor, informe seu nome."); setFormState("error"); return; }
    if (form.rating === 0) { setErrorMsg("Por favor, selecione uma nota."); setFormState("error"); return; }
    if (form.comment.trim().length < 10) { setErrorMsg("Escreva um comentário com pelo menos 10 caracteres."); setFormState("error"); return; }
    const newReview = { id: Date.now(), wineId: wine.id, author: form.author.trim(), rating: form.rating, comment: form.comment.trim(), date: new Date().toLocaleDateString("pt-BR"), approved: false };
    setReviews((prev) => [newReview, ...prev]);
    setReviewedWines(prev => new Set([...prev, wine.id]));
    if (onSubmitReview) onSubmitReview(newReview);
    setForm({ author: "", rating: 0, comment: "" });
    setFormState("success");
    setErrorMsg("");
    setTimeout(() => setFormState("idle"), 5000);
  };

  return (
    <div style={{ marginTop: 48, paddingTop: 32, borderTop: "1px solid #2a1f1f" }}>
      <div style={{ fontSize: 9, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 6 }}>Opinião de quem comprou</div>
      <h3 style={{ fontSize: 20, color: "#f5f0e8", marginBottom: 24 }}>Avaliações</h3>

      {/* Resumo */}
      {wineReviews.length > 0 && (
        <div style={{ display: "flex", gap: 32, marginBottom: 32, flexWrap: "wrap" }}>
          {/* Nota grande */}
          <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 12, padding: "20px 28px", textAlign: "center", minWidth: 120 }}>
            <div style={{ fontSize: 48, fontWeight: "bold", color: "#f59e0b", lineHeight: 1 }}>{avgRating}</div>
            <div style={{ color: "#f59e0b", fontSize: 20, margin: "6px 0 4px" }}>{"★".repeat(Math.round(avgRating))}{"☆".repeat(5 - Math.round(avgRating))}</div>
            <div style={{ fontSize: 10, color: "#5a4a4a" }}>{wineReviews.length} avaliação{wineReviews.length > 1 ? "ões" : ""}</div>
          </div>
          {/* Barras */}
          <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
            {distribution.map(({ star, count, pct }) => (
              <div key={star} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#a09080", width: 14, textAlign: "right" }}>{star}</span>
                <span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>
                <div style={{ flex: 1, height: 6, background: "#1a1410", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(to right,#b45309,#f59e0b)", borderRadius: 3, transition: "width .6s ease" }} />
                </div>
                <span style={{ fontSize: 10, color: "#5a4a4a", width: 18 }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      {wineReviews.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#5a4a4a", marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
          <div style={{ fontSize: 13 }}>Ainda sem avaliações. Seja o primeiro!</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
          {displayed.map((r) => (
            <div key={r.id} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: "16px 18px", animation: "fadeIn .3s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#8b2c2c,#5a1a1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#e8b4b4", fontWeight: "bold" }}>
                    {r.author[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: "#f5f0e8", fontWeight: "bold" }}>{r.author}</div>
                    <div style={{ fontSize: 10, color: "#5a4a4a" }}>{r.date}</div>
                  </div>
                </div>
                <div style={{ color: "#f59e0b", fontSize: 14 }}>
                  {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#a09080", lineHeight: 1.7, margin: 0 }}>{r.comment}</p>
            </div>
          ))}

          {wineReviews.length > 3 && (
            <button onClick={() => setShowAll(!showAll)} style={{ background: "none", border: "1px solid #2a1f1f", borderRadius: 6, color: "#8b6060", padding: "10px", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1, transition: "all .2s" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#8b2c2c"; e.currentTarget.style.color = "#e8b4b4"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a1f1f"; e.currentTarget.style.color = "#8b6060"; }}>
              {showAll ? "▲ Mostrar menos" : `▼ Ver todas as ${wineReviews.length} avaliações`}
            </button>
          )}
        </div>
      )}

      {/* Formulário */}
      <div style={{ background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 12, padding: "22px 22px" }}>
        <div style={{ fontSize: 13, color: "#e8b4b4", fontWeight: "bold", marginBottom: 18 }}>✍️ Deixe sua avaliação</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 6 }}>Sua nota</label>
            <StarPicker value={form.rating} onChange={(v) => setForm((p) => ({ ...p, rating: v }))} size={28} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 6 }}>Nome <span style={{ color: "#8b2c2c" }}>*</span></label>
            <input value={form.author} onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))} placeholder="Seu nome"
              style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 6 }}>Comentário <span style={{ color: "#8b2c2c" }}>*</span></label>
            <textarea value={form.comment} onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))} rows={3} placeholder="Conte sua experiência com este vinho..."
              style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", resize: "vertical" }} />
          </div>
        </div>

        {formState === "error" && <div style={{ marginTop: 10, fontSize: 11, color: "#f87171" }}>⚠ {errorMsg}</div>}
        {formState === "success" && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(74,222,128,.07)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 6, fontSize: 12, color: "#4ade80" }}>
            ✅ Avaliação enviada! Ela será publicada após aprovação.
          </div>
        )}

        <button onClick={handleSubmit} style={{ marginTop: 14, padding: "11px 24px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 2, textTransform: "uppercase", transition: "background .2s" }}
          onMouseEnter={(e) => e.currentTarget.style.background = "#a83232"}
          onMouseLeave={(e) => e.currentTarget.style.background = "#8b2c2c"}>
          Enviar Avaliação
        </button>
        <div style={{ fontSize: 9, color: "#3a2a2a", marginTop: 8 }}>Sua avaliação será publicada após aprovação da loja.</div>
      </div>
    </div>
  );
};

// ── FreteCalculator ───────────────────────────────────────────────────────────
const FreteCalculator = ({ wine }) => {
  const [cep, setCep] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);

  const calcFrete = () => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) { setStatus("error"); return; }
    setStatus("loading");
    setOptions([]);
    setSelected(null);

    setTimeout(() => {
      // Simula frete por região via prefixo CEP
      const prefix = parseInt(clean.slice(0, 2));
      let region = "Sul/Sudeste";
      let pacDays = 5, sedexDays = 2;
      let pacBase = 18, sedexBase = 32;

      if (prefix <= 19) { region = "São Paulo (Capital)"; pacDays = 3; sedexDays = 1; pacBase = 14; sedexBase = 24; }
      else if (prefix <= 28) { region = "São Paulo (Interior)"; pacDays = 4; sedexDays = 1; pacBase = 16; sedexBase = 26; }
      else if (prefix <= 39) { region = "Minas Gerais"; pacDays = 5; sedexDays = 2; pacBase = 18; sedexBase = 29; }
      else if (prefix <= 49) { region = "Espírito Santo / Bahia"; pacDays = 6; sedexDays = 2; pacBase = 20; sedexBase = 32; }
      else if (prefix <= 56) { region = "Bahia"; pacDays = 7; sedexDays = 3; pacBase = 22; sedexBase = 35; }
      else if (prefix <= 63) { region = "Centro-Oeste"; pacDays = 8; sedexDays = 3; pacBase = 24; sedexBase = 38; }
      else if (prefix <= 72) { region = "Brasília / Goiás"; pacDays = 6; sedexDays = 2; pacBase = 20; sedexBase = 33; }
      else if (prefix <= 76) { region = "Norte / Nordeste"; pacDays = 10; sedexDays = 4; pacBase = 28; sedexBase = 44; }
      else if (prefix <= 79) { region = "Mato Grosso do Sul"; pacDays = 8; sedexDays = 3; pacBase = 23; sedexBase = 37; }
      else if (prefix <= 87) { region = "Paraná"; pacDays = 5; sedexDays = 2; pacBase = 17; sedexBase = 28; }
      else if (prefix <= 89) { region = "Santa Catarina"; pacDays = 5; sedexDays = 2; pacBase = 17; sedexBase = 28; }
      else { region = "Rio Grande do Sul"; pacDays = 6; sedexDays = 2; pacBase = 19; sedexBase = 31; }

      const weight = 1.5; // kg estimado por garrafa
      const pac = +(pacBase + weight * 2.5).toFixed(2);
      const sedex = +(sedexBase + weight * 4.0).toFixed(2);

      setOptions([
        { id: "pac",   label: "PAC",   icon: "📦", days: pacDays,   price: pac,   desc: `Correios PAC · ${region}` },
        { id: "sedex", label: "SEDEX", icon: "⚡", days: sedexDays, price: sedex, desc: `Correios SEDEX · ${region}` },
      ]);
      setStatus("done");
    }, 1400);
  };

  const formatCep = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
  };

  return (
    <div style={{ background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 10, padding: "18px 20px", marginTop: 4 }}>
      <div style={{ fontSize: 9, letterSpacing: 3, color: "#8b6060", textTransform: "uppercase", marginBottom: 10 }}>📦 Calcular Frete e Entrega</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={cep}
          onChange={(e) => setCep(formatCep(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && calcFrete()}
          placeholder="00000-000"
          maxLength={9}
          style={{ flex: 1, background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 13px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia,serif", letterSpacing: 2 }}
        />
        <button
          onClick={calcFrete}
          disabled={status === "loading"}
          style={{ padding: "10px 18px", background: status === "loading" ? "#2a1f1f" : "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: status === "loading" ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1, transition: "background .2s", whiteSpace: "nowrap" }}
        >
          {status === "loading" ? "Calculando…" : "Calcular"}
        </button>
      </div>

      {/* Loading */}
      {status === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
          <div style={{ width: 18, height: 18, border: "2px solid #2a1f1f", borderTop: "2px solid #8b2c2c", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <span style={{ fontSize: 12, color: "#7a6a6a" }}>Consultando opções de entrega…</span>
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div style={{ fontSize: 11, color: "#f87171", padding: "8px 0" }}>⚠ CEP inválido. Digite os 8 dígitos.</div>
      )}

      {/* Results */}
      {status === "done" && (
        <div>
          <div style={{ fontSize: 10, color: "#5a4a4a", marginBottom: 10 }}>Opções para o CEP {cep}:</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {options.map((opt) => (
              <div key={opt.id}
                onClick={() => setSelected(opt.id)}
                style={{ flex: 1, minWidth: 140, background: selected === opt.id ? "rgba(139,44,44,.2)" : "#1a1410", border: `1px solid ${selected === opt.id ? "#8b2c2c" : "#2a1f1f"}`, borderRadius: 8, padding: "12px 14px", cursor: "pointer", transition: "all .2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 16 }}>{opt.icon}</span>
                  <span style={{ fontSize: 13, color: "#f5f0e8", fontWeight: "bold" }}>{opt.label}</span>
                  {selected === opt.id && <span style={{ marginLeft: "auto", color: "#8b2c2c", fontSize: 14 }}>✓</span>}
                </div>
                <div style={{ fontSize: 16, color: "#e8b4b4", fontWeight: "bold", marginBottom: 3 }}>{fmt(opt.price)}</div>
                <div style={{ fontSize: 11, color: "#4ade80" }}>Chega em até <strong>{opt.days} dias úteis</strong></div>
                <div style={{ fontSize: 9, color: "#5a4a4a", marginTop: 3 }}>{opt.desc}</div>
              </div>
            ))}
          </div>
          {selected && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(74,222,128,.06)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 6, fontSize: 12, color: "#4ade80" }}>
              ✅ {options.find(o => o.id === selected)?.label} selecionado · {fmt(options.find(o => o.id === selected)?.price)} · até {options.find(o => o.id === selected)?.days} dias úteis
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

// ── InfoSlider ────────────────────────────────────────────────────────────────
const INFO_SLIDES = [
  { icon: "🌍", text: "Vinhos importados das melhores regiões do mundo", accent: "#e8b4b4", bg: "linear-gradient(90deg,#1a0808,#2d1010,#1a0808)" },
  { icon: "🔒", text: "Pagamento 100% seguro — cartão, Pix e boleto", accent: "#4ade80", bg: "linear-gradient(90deg,#051a0e,#0a2a18,#051a0e)" },
  { icon: "💰", text: "5% OFF pagando com Pix — desconto automático", accent: "#fbbf24", bg: "linear-gradient(90deg,#1a1000,#2a1800,#1a1000)" },
];

const InfoSlider = () => {
  const [idx, setIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef(null);

  const go = useCallback((next) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => { setIdx(next); setAnimating(false); }, 220);
  }, [animating]);

  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => go((idx + 1) % INFO_SLIDES.length), 3600);
    return () => clearInterval(timerRef.current);
  }, [idx, go]);

  const s = INFO_SLIDES[idx];

  return (
    <div style={{ background: s.bg, borderTop: "1px solid rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.04)", transition: "background .5s ease" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 44px", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", height: 38 }}>
        <button onClick={() => go((idx - 1 + INFO_SLIDES.length) % INFO_SLIDES.length)}
          style={{ position: "absolute", left: 8, background: "none", border: "none", color: "rgba(255,255,255,.2)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 8px", transition: "color .2s" }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,.6)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.2)"}>‹</button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: animating ? 0 : 1, transition: "opacity .22s ease" }}>
          <span style={{ fontSize: 13 }}>{s.icon}</span>
          <span style={{ fontSize: 11, color: s.accent, letterSpacing: .3 }}>{s.text}</span>
          <div style={{ display: "flex", gap: 4, marginLeft: 8 }}>
            {INFO_SLIDES.map((_, i) => (
              <button key={i} onClick={() => go(i)} style={{ width: i === idx ? 14 : 4, height: 4, borderRadius: 2, border: "none", background: i === idx ? s.accent : "rgba(255,255,255,.15)", cursor: "pointer", padding: 0, transition: "all .3s" }} />
            ))}
          </div>
        </div>

        <button onClick={() => go((idx + 1) % INFO_SLIDES.length)}
          style={{ position: "absolute", right: 8, background: "none", border: "none", color: "rgba(255,255,255,.2)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "4px 8px", transition: "color .2s" }}
          onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,.6)"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.2)"}>›</button>
      </div>
    </div>
  );
};
const HeroBannerCarousel = ({ banners, onFilterChange, setPage }) => {
  const active = banners.filter(b => b.active);
  const [idx, setIdx] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (active.length <= 1) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx(p => (p + 1) % active.length), 4500);
    return () => clearInterval(timerRef.current);
  }, [active.length]);

  if (active.length === 0) return null;
  const b = active[idx];
  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 14, margin: "0 0 0 0" }}>
      <div key={b.id} style={{ background: b.bg, padding: "30px 36px", minHeight: 140, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, animation: "fadeIn .5s ease", borderBottom: `1px solid rgba(255,255,255,.05)` }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 8, letterSpacing: 3, padding: "3px 10px", border: `1px solid ${b.accent}40`, color: b.accent, borderRadius: 3, textTransform: "uppercase" }}>{b.tag}</span>
          <h2 style={{ fontSize: 22, color: "#f5f0e8", margin: "10px 0 6px", letterSpacing: .5 }}>{b.title}</h2>
          <p style={{ fontSize: 13, color: "#a09080", marginBottom: 18 }}>{b.subtitle}</p>
          <button onClick={() => { if (b.targetFilter) { setPage("store"); onFilterChange(b.targetFilter); } }}
            style={{ padding: "9px 22px", background: b.accent, border: "none", borderRadius: 4, color: "#0c0a09", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", fontFamily: "Georgia,serif", fontWeight: "bold" }}>
            {b.cta} →
          </button>
        </div>
        <div style={{ fontSize: 72, opacity: .12, userSelect: "none", flexShrink: 0 }}>🍷</div>
      </div>
      {active.length > 1 && (
        <div style={{ position: "absolute", bottom: 12, right: 18, display: "flex", gap: 6 }}>
          {active.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)}
              style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 4, border: "none", background: i === idx ? b.accent : "rgba(255,255,255,.2)", cursor: "pointer", padding: 0, transition: "all .3s" }} />
          ))}
        </div>
      )}
      {active.length > 1 && (
        <>
          <button onClick={() => setIdx(p => (p - 1 + active.length) % active.length)}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "50%", width: 28, height: 28, color: "#f5f0e8", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <button onClick={() => setIdx(p => (p + 1) % active.length)}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.1)", borderRadius: "50%", width: 28, height: 28, color: "#f5f0e8", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </>
      )}
    </div>
  );
};

// ── ClientAccountPanel ────────────────────────────────────────────────────────
const ClientAccountPanel = ({ wines, addToCart, setSelectedWine, setPage, onClose, onOrderComplete }) => {
  const [authMode, setAuthMode] = useState(() => {
    try { return localStorage.getItem("v9_client") ? "loggedin" : "login"; } catch { return "login"; }
  });
  const [tab, setTab] = useState("orders");
  const [wishlist, setWishlist] = useState(() => { try { const s = localStorage.getItem("v9_wishlist"); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPwd, setRegPwd] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [authError, setAuthError] = useState("");

  // Cliente real salvo no localStorage
  const [client, setClient] = useState(() => {
    try {
      const s = localStorage.getItem("v9_client");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const saveClient = (c) => { setClient(c); try { localStorage.setItem("v9_client", JSON.stringify(c)); } catch {} };

  const tierColor = { Gold: "#fbbf24", Silver: "#c0c0c0", Bronze: "#cd7f32" }[client?.tier] || "#e8b4b4";
  const wishlistWines = wines.filter(w => wishlist.includes(w.id));

  const getTier = (pts) => pts >= 5000 ? "Gold" : pts >= 2000 ? "Silver" : "Bronze";
  const tierMeta = { Bronze: { next: "Silver", needed: 2000 }, Silver: { next: "Gold", needed: 5000 }, Gold: { next: null, needed: 5000 } };

  const handleLogin = () => {
    if (!loginEmail || !loginPwd) { setAuthError("Preencha e-mail e senha."); return; }
    try {
      const all = JSON.parse(localStorage.getItem("v9_clients_db") || "{}");
      const found = Object.values(all).find(c => c.email === loginEmail && c.pwd === loginPwd);
      if (found) { saveClient(found); setAuthMode("loggedin"); setAuthError(""); }
      else setAuthError("E-mail ou senha incorretos.");
    } catch { setAuthError("Erro ao fazer login."); }
  };

  const handleRegister = () => {
    if (!regName || !regEmail || !regPwd) { setAuthError("Preencha todos os campos obrigatórios."); return; }
    if (regPwd.length < 6) { setAuthError("A senha deve ter ao menos 6 caracteres."); return; }
    const newClient = {
      id: `c_${Date.now()}`, name: regName, email: regEmail, pwd: regPwd, phone: regPhone,
      since: new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
      tier: "Bronze", points: 200, orders: [],
      pointsHistory: [{ date: new Date().toLocaleDateString("pt-BR"), desc: "Boas-vindas", pts: 200 }],
      savedCoupons: ["BEMVINDO"],
    };
    try {
      const all = JSON.parse(localStorage.getItem("v9_clients_db") || "{}");
      all[newClient.id] = newClient;
      localStorage.setItem("v9_clients_db", JSON.stringify(all));
    } catch {}
    saveClient(newClient);
    setAuthMode("loggedin"); setAuthError("");
    // E-mail de boas-vindas
    sendEmail("boasVindas", { to_email: regEmail, to_name: regName, store_name: "Vinhos9", coupon_code: "BEMVINDO" });
  };

  // Atualiza cliente no DB quando muda
  const updateClientDB = (updated) => {
    saveClient(updated);
    try {
      const all = JSON.parse(localStorage.getItem("v9_clients_db") || "{}");
      if (updated.id) { all[updated.id] = updated; localStorage.setItem("v9_clients_db", JSON.stringify(all)); }
    } catch {}
  };

  const TABS = [
    ["orders", "📦", "Pedidos"],
    ["pontos", "🪙", "Pontos"],
    ["wishlist", "❤️", "Favoritos"],
    ["coupons", "🎁", "Cupons"],
    ["profile", "👤", "Perfil"],
  ];

  const inputStyle = { width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "11px 13px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 460, height: "100vh", background: "#0e0c0b", borderLeft: "1px solid #2a1f1f", display: "flex", flexDirection: "column", animation: "slideIn .3s ease", overflowY: "auto" }}>

        {/* ── TELA DE LOGIN ── */}
        {authMode === "login" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 28px" }}>
            <button onClick={onClose} style={{ position: "absolute", top: 18, right: 18, background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 18 }}>✕</button>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🍷</div>
              <div style={{ fontSize: 9, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 6 }}>Vinhos9</div>
              <h2 style={{ fontSize: 21, color: "#e8b4b4" }}>Bem-vindo de volta</h2>
              <p style={{ fontSize: 12, color: "#5a4a4a", marginTop: 5 }}>Acesse sua conta para ver pedidos e favoritos</p>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>E-mail</label>
              <input value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="seu@email.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Senha</label>
              <div style={{ position: "relative" }}>
                <input type={showPwd ? "text" : "password"} value={loginPwd} onChange={e => setLoginPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ ...inputStyle, paddingRight: 42 }} />
                <button onClick={() => setShowPwd(!showPwd)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 13 }}>{showPwd ? "🙈" : "👁"}</button>
              </div>
            </div>
            {authError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>⚠ {authError}</div>}
            <button onClick={handleLogin} style={{ width: "100%", padding: "13px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
              Entrar
            </button>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "#5a4a4a" }}>Ainda não tem conta? </span>
              <button onClick={() => { setAuthMode("register"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#e8b4b4", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", textDecoration: "underline" }}>Criar conta grátis</button>
            </div>
          </div>
        )}

        {/* ── TELA DE CADASTRO ── */}
        {authMode === "register" && (
          <div style={{ flex: 1, padding: "28px 28px 36px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 26 }}>
              <button onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#7a6a6a", cursor: "pointer", fontSize: 18 }}>←</button>
              <div>
                <h2 style={{ fontSize: 19, color: "#e8b4b4" }}>Criar Conta</h2>
                <p style={{ fontSize: 11, color: "#5a4a4a", marginTop: 2 }}>Cadastre-se e acompanhe seus pedidos</p>
              </div>
              <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            {[
              ["Nome completo *", regName, setRegName, "text", "João da Silva"],
              ["E-mail *", regEmail, setRegEmail, "email", "joao@email.com"],
              ["Telefone", regPhone, setRegPhone, "tel", "(11) 99999-0000"],
            ].map(([label, val, setter, type, ph]) => (
              <div key={label} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>{label}</label>
                <input type={type} value={val} onChange={e => setter(e.target.value)} placeholder={ph} style={inputStyle} />
              </div>
            ))}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Senha * <span style={{ color: "#3a2a2a" }}>(mín. 6 caracteres)</span></label>
              <div style={{ position: "relative" }}>
                <input type={showPwd ? "text" : "password"} value={regPwd} onChange={e => setRegPwd(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, paddingRight: 42 }} />
                <button onClick={() => setShowPwd(!showPwd)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 13 }}>{showPwd ? "🙈" : "👁"}</button>
              </div>
            </div>
            {authError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 10 }}>⚠ {authError}</div>}
            <div style={{ background: "rgba(139,44,44,.07)", border: "1px solid rgba(139,44,44,.2)", borderRadius: 6, padding: "10px 13px", marginBottom: 18, fontSize: 11, color: "#8b6060", lineHeight: 1.6 }}>
              🎁 Ao criar sua conta você ganha <strong style={{ color: "#e8b4b4" }}>200 pontos</strong> de boas-vindas e acesso ao cupom <strong style={{ color: "#fbbf24" }}>BEMVINDO</strong> com 15% OFF.
            </div>
            <button onClick={handleRegister} style={{ width: "100%", padding: "13px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
              Criar Minha Conta
            </button>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "#5a4a4a" }}>Já tem conta? </span>
              <button onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ background: "none", border: "none", color: "#e8b4b4", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", textDecoration: "underline" }}>Entrar</button>
            </div>
          </div>
        )}

        {/* ── PAINEL LOGADO ── */}
        {authMode === "loggedin" && (<>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#1a0a0a,#2d1010)", padding: "24px 20px 20px", borderBottom: "1px solid #2a1f1f", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 8, letterSpacing: 3, color: "#8b6060", textTransform: "uppercase", marginBottom: 3 }}>Minha Conta</div>
              <div style={{ fontSize: 19, color: "#f5f0e8", fontWeight: "bold" }}>{client.name}</div>
              <div style={{ fontSize: 11, color: "#7a6a6a", marginTop: 2 }}>{client.email}</div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", color: "#7a6a6a", cursor: "pointer", fontSize: 18 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[[" ⭐","Nível",client?.tier || "Bronze",tierColor],["🪙","Pontos",(client?.points || 0).toLocaleString("pt-BR"),"#e8b4b4"],["📅","Desde",client?.since || "—","#a09080"]].map(([icon,label,val,col]) => (
              <div key={label} style={{ background: "rgba(0,0,0,.3)", border: "1px solid #2a1f1f", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 8, color: "#5a4a4a", letterSpacing: 2, textTransform: "uppercase" }}>{label}</div>
                  <div style={{ fontSize: 12, color: col, fontWeight: "bold" }}>{val}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #2a1f1f", flexShrink: 0, background: "#100c0c" }}>
          {TABS.map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "12px 4px", background: "none", border: "none", borderBottom: tab === t ? "2px solid #8b2c2c" : "2px solid transparent", color: tab === t ? "#e8b4b4" : "#5a4a4a", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, transition: "color .2s" }}>
              <span style={{ fontSize: 15 }}>{icon}</span>
              <span style={{ letterSpacing: .5 }}>{label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "20px 18px", overflowY: "auto" }}>
          {tab === "orders" && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 14 }}>Histórico de Compras ({(client?.orders || []).length})</div>
              {(client?.orders || []).length === 0 && <div style={{ textAlign: "center", padding: 32, color: "#5a4a4a", fontSize: 12 }}>Nenhuma compra ainda. Explore o catálogo! 🍷</div>}
              {(client?.orders || []).map((order) => {
                const statusColors = { "Entregue": "#4ade80", "Em trânsito": "#fbbf24", "Aguardando": "#a09080" };
                const statusBg = { "Entregue": "#1a3a1a", "Em trânsito": "#2a2510", "Aguardando": "#1a1a1a" };
                return (
                  <div key={order.id} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#e8b4b4", fontWeight: "bold" }}>{order.id}</span>
                      <span style={{ fontSize: 9, padding: "2px 10px", borderRadius: 10, background: statusBg[order.status] || "#1a1a1a", color: statusColors[order.status] || "#a09080" }}>{order.status}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#5a4a4a", marginBottom: 8 }}>{order.date}</div>
                    {(order.wines || [order.items]).filter(Boolean).map((w, i) => <div key={i} style={{ fontSize: 11, color: "#a09080", marginBottom: 2 }}>· {w}</div>)}
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a1410", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#e8b4b4", fontWeight: "bold" }}>{fmt(order.total)}</span>
                      {order.pts && <span style={{ fontSize: 10, color: "#fbbf24" }}>+{order.pts} pts</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "pontos" && (
            <div>
              {/* Saldo atual */}
              <div style={{ background: "linear-gradient(145deg,#1a1a0e,#12100a)", border: "1px solid #3a3a1a", borderRadius: 10, padding: "20px 18px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#7a7a2a", textTransform: "uppercase", marginBottom: 8 }}>Saldo de Pontos</div>
                <div style={{ fontSize: 36, color: "#fbbf24", fontWeight: "bold", marginBottom: 4 }}>{(client?.points || 0).toLocaleString("pt-BR")} <span style={{ fontSize: 14, color: "#7a7a2a" }}>pts</span></div>
                <div style={{ fontSize: 11, color: "#5a5a2a", marginBottom: 12 }}>R$ 1 gasto = 1 ponto</div>
                {/* Barra de nível */}
                {(() => {
                  const pts = client?.points || 0;
                  const tier = getTier(pts);
                  const meta = tierMeta[tier];
                  const pct = meta.next ? Math.min(100, (pts / meta.needed) * 100) : 100;
                  return (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#5a4a4a", marginBottom: 4 }}>
                        <span style={{ color: tierColor }}>⭐ {tier}</span>
                        {meta.next ? <span>{pts.toLocaleString()} / {meta.needed.toLocaleString()} pts → {meta.next}</span> : <span style={{ color: "#fbbf24" }}>Nível máximo! 🏆</span>}
                      </div>
                      <div style={{ background: "#2a2a1a", borderRadius: 6, height: 7, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(to right, ${tierColor}88, ${tierColor})`, borderRadius: 6, transition: "width .5s" }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Histórico */}
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 12 }}>Histórico de Pontos</div>
              {(client?.pointsHistory || []).length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#5a4a4a", fontSize: 12 }}>Nenhuma movimentação ainda.</div>}
              {[...(client?.pointsHistory || [])].reverse().map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1a1410" }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#f5f0e8" }}>{h.desc}</div>
                    <div style={{ fontSize: 10, color: "#5a4a4a", marginTop: 2 }}>{h.date}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: "bold", color: h.pts > 0 ? "#4ade80" : "#ef4444" }}>
                    {h.pts > 0 ? "+" : ""}{h.pts} pts
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "wishlist" && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 14 }}>Favoritos ({wishlistWines.length})</div>
              {wishlistWines.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#5a4a4a", fontSize: 12 }}>Sua lista está vazia. Navegue pelo catálogo! ❤️</div>
              ) : wishlistWines.map((wine) => (
                <div key={wine.id} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 50, height: 50, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}><WineThumb wine={wine} height={50} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#f5f0e8", fontWeight: "bold", marginBottom: 2 }}>{wine.name}</div>
                    <div style={{ fontSize: 10, color: "#7a6a6a" }}>{wine.origin} · {wine.year}</div>
                    <div style={{ fontSize: 13, color: wine.promoPrice ? "#fbbf24" : "#e8b4b4", fontWeight: "bold", marginTop: 2 }}>{fmt(wine.promoPrice || wine.price)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <button onClick={() => addToCart(wine)} style={{ background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", padding: "5px 10px", cursor: "pointer", fontSize: 9, fontFamily: "Georgia,serif", letterSpacing: 1 }}>+ Carrinho</button>
                    <button onClick={() => setWishlist(p => p.filter(id => id !== wine.id))} style={{ background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#5a4a4a", padding: "4px 10px", cursor: "pointer", fontSize: 9, fontFamily: "Georgia,serif" }}>Remover</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "coupons" && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 14 }}>Seus Cupons</div>
              {(client?.savedCoupons || []).length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#5a4a4a", fontSize: 12 }}>Nenhum cupom disponível.</div>}
              {(client?.savedCoupons || []).map((code) => (
                <div key={code} style={{ background: "linear-gradient(145deg,#1a1500,#120e00)", border: "1px dashed #3a2a00", borderRadius: 10, padding: "16px 18px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 17, color: "#fbbf24", fontWeight: "bold", letterSpacing: 2 }}>{code}</div>
                    <div style={{ fontSize: 10, color: "#7a6060", marginTop: 4 }}>Cupom de desconto — use no carrinho</div>
                  </div>
                  <div style={{ fontSize: 22 }}>🎁</div>
                </div>
              ))}
              <div style={{ background: "rgba(74,222,128,.05)", border: "1px solid rgba(74,222,128,.15)", borderRadius: 10, padding: "14px 16px", marginTop: 8 }}>
                <div style={{ fontSize: 10, color: "#4ade80", marginBottom: 6, letterSpacing: 1 }}>🪙 Seus pontos</div>
                <div style={{ background: "#1a3a1a", borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 6 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, ((client?.points || 0) / 5000) * 100)}%`, background: "linear-gradient(to right,#166534,#4ade80)", borderRadius: 6 }} />
                </div>
                <div style={{ fontSize: 10, color: "#5a4a4a" }}>{(client?.points || 0).toLocaleString()} / 5.000 pontos para nível Gold</div>
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div>
              <div style={{ fontSize: 10, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 14 }}>Informações Pessoais</div>
              {[["Nome completo", client?.name],["E-mail", client?.email],["Telefone", client?.phone || "—"],["Cliente desde", client?.since || "—"]].map(([label, value]) => (
                <div key={label} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
                  <div style={{ background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 13px", fontSize: 13, color: "#f5f0e8", fontFamily: "Georgia,serif" }}>{value}</div>
                </div>
              ))}
              <button onClick={() => { saveClient(null); try { localStorage.removeItem("v9_client"); } catch {} setAuthMode("login"); setLoginEmail(""); setLoginPwd(""); }}
                style={{ marginTop: 8, width: "100%", padding: "11px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#7a6a6a", cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif", letterSpacing: 1 }}>
                🚪 Sair da conta
              </button>
            </div>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
};



// ── App ───────────────────────────────────────────────────────────────────────
// ─── Painel Supabase (componente próprio para evitar hook em IIFE) ────────────
const SupabasePanel = ({ supaCfg, supaConnected, supaStatus, testSupaConnection, loadFromSupabase, showToast }) => {
  const [inputUrl, setInputUrl] = useState(supaCfg?.url || "");
  const [inputKey, setInputKey] = useState(supaCfg?.key || "");
  const [showKey, setShowKey] = useState(false);
  const SQL_SCHEMA = `create table if not exists wines (
  id bigint generated always as identity primary key,
  name text not null, origin text, region text, year int,
  cost_price numeric default 0, price numeric not null, promo_price numeric,
  stock int default 0, category text default 'Tinto',
  alcohol text, grapes text, description text, img text,
  keywords text default '', harmonization text default '',
  rating numeric default 4.5, sales int default 0,
  created_at timestamptz default now()
);
create table if not exists orders (
  id bigint generated always as identity primary key,
  customer text, cpf text, contact text, address text,
  items text, total numeric, coupon text,
  status text default 'Aguardando', date text,
  created_at timestamptz default now()
);
create table if not exists customers (
  id bigint generated always as identity primary key,
  name text, email text unique, phone text,
  created_at timestamptz default now()
);
create table if not exists reviews (
  id bigint generated always as identity primary key,
  wine_id bigint references wines(id) on delete cascade,
  author text, rating int, comment text,
  approved boolean default false, date text,
  created_at timestamptz default now()
);
alter table wines     enable row level security;
alter table orders    enable row level security;
alter table customers enable row level security;
alter table reviews   enable row level security;
create policy "public read wines"     on wines     for select using (true);
create policy "public insert wines"   on wines     for insert with check (true);
create policy "public update wines"   on wines     for update using (true);
create policy "public delete wines"   on wines     for delete using (true);
create policy "public insert orders"  on orders    for insert with check (true);
create policy "public read orders"    on orders    for select using (true);
create policy "public insert reviews" on reviews   for insert with check (true);
create policy "public read reviews"   on reviews   for select using (true);
create policy "public update reviews" on reviews   for update using (true);
create policy "public delete reviews" on reviews   for delete using (true);`;

  const SQL_STORAGE = `-- Cole no SQL Editor do Supabase para criar o bucket de imagens:
insert into storage.buckets (id, name, public)
values ('wines', 'wines', true)
on conflict (id) do nothing;

create policy "public upload wines storage"
on storage.objects for insert
with check (bucket_id = 'wines');

create policy "public read wines storage"
on storage.objects for select
using (bucket_id = 'wines');

create policy "public delete wines storage"
on storage.objects for delete
using (bucket_id = 'wines');`;
  const copySQL = () => { navigator.clipboard?.writeText(SQL_SCHEMA); showToast("SQL copiado! Cole no Editor SQL do Supabase."); };
  const copyStorageSQL = () => { navigator.clipboard?.writeText(SQL_STORAGE); showToast("SQL do Storage copiado!"); };
  const card = { background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 18 };
  const inputStyle = { width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 12, fontFamily: "monospace" };
  return (
    <div style={{ maxWidth: 660 }}>
      <h1 style={{ fontSize: 21, marginBottom: 5 }}>🗄️ Banco de Dados — Supabase</h1>
      <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 16 }}>Conecte o Vinhos9 ao Supabase para persistir produtos, pedidos e avaliações.</p>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 20, marginBottom: 22,
        background: supaConnected ? "rgba(74,222,128,.1)" : supaStatus === "cors" ? "rgba(251,191,36,.1)" : supaStatus === "error" ? "rgba(248,113,113,.1)" : "#1a1410",
        border: `1px solid ${supaConnected ? "#4ade80" : supaStatus === "cors" ? "#fbbf24" : supaStatus === "error" ? "#f87171" : "#2a1f1f"}` }}>
        <span style={{ fontSize: 8 }}>●</span>
        <span style={{ fontSize: 11, color: supaConnected ? "#4ade80" : supaStatus === "cors" ? "#fbbf24" : supaStatus === "error" ? "#f87171" : "#7a6a6a" }}>
          {supaConnected ? "Conectado ao Supabase ✓" : supaStatus === "testing" ? "Testando conexão…" : supaStatus === "cors" ? "✓ Credenciais salvas — ativo após publicar" : supaStatus === "error" ? "Falha na conexão" : "Não conectado — usando dados locais"}
        </span>
      </div>
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 12 }}>Passo 1 — Criar as tabelas no Supabase</div>
        <p style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.7, marginBottom: 12 }}>Vá em <strong style={{ color: "#e8b4b4" }}>SQL Editor → New Query</strong>, cole e clique <strong style={{ color: "#e8b4b4" }}>Run</strong>.</p>
        <div style={{ background: "#0c0a09", borderRadius: 6, padding: "10px 14px", fontSize: 10, color: "#4a4a4a", fontFamily: "monospace", maxHeight: 120, overflowY: "auto", marginBottom: 12, lineHeight: 1.6 }}>
          {SQL_SCHEMA.split("\n").slice(0, 8).join("\n")}<span style={{ color: "#2a2a2a" }}>{"\n"}…</span>
        </div>
        <button onClick={copySQL} style={{ padding: "8px 18px", background: "#1a1410", border: "1px solid #3a2f2f", color: "#e8b4b4", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>📋 Copiar SQL completo</button>
      </div>
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 12 }}>Passo 1b — Criar bucket de imagens (Storage)</div>
        <p style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.7, marginBottom: 12 }}>
          Necessário para salvar fotos dos vinhos. Cole no <strong style={{ color: "#e8b4b4" }}>SQL Editor</strong> e clique <strong style={{ color: "#e8b4b4" }}>Run</strong>.
        </p>
        <div style={{ background: "#0c0a09", borderRadius: 6, padding: "10px 14px", fontSize: 10, color: "#4a4a4a", fontFamily: "monospace", maxHeight: 100, overflowY: "auto", marginBottom: 12, lineHeight: 1.6 }}>
          {SQL_STORAGE.split("\n").slice(0, 5).join("\n")}<span style={{ color: "#2a2a2a" }}>{"\n"}…</span>
        </div>
        <button onClick={copyStorageSQL} style={{ padding: "8px 18px", background: "#1a1410", border: "1px solid #3a2f2f", color: "#e8b4b4", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>🖼 Copiar SQL do Storage</button>
      </div>
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 12 }}>Passo 2 — Conectar o projeto</div>
        <p style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.7, marginBottom: 14 }}>Vá em <strong style={{ color: "#e8b4b4" }}>Settings → API</strong> e copie a <strong style={{ color: "#e8b4b4" }}>Project URL</strong> e a <strong style={{ color: "#e8b4b4" }}>Publishable key</strong>.</p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Project URL</label>
          <input value={inputUrl} onChange={e => setInputUrl(e.target.value)} placeholder="https://xxxxxxxxxxx.supabase.co" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Publishable Key</label>
          <div style={{ position: "relative" }}>
            <input type={showKey ? "text" : "password"} value={inputKey} onChange={e => setInputKey(e.target.value)} placeholder="sb_publishable_…" style={{ ...inputStyle, paddingRight: 40 }} />
            <button onClick={() => setShowKey(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 13 }}>{showKey ? "🙈" : "👁"}</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => testSupaConnection(inputUrl, inputKey)} disabled={!inputUrl || !inputKey || supaStatus === "testing"}
            style={{ padding: "11px 24px", background: supaStatus === "testing" ? "#2a1f1f" : "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1 }}>
            {supaStatus === "testing" ? "⏳ Testando…" : "🔌 Conectar e Sincronizar"}
          </button>
          {supaConnected && <button onClick={() => loadFromSupabase(supaCfg)} style={{ padding: "11px 18px", background: "#1a3a1a", border: "1px solid #4ade80", borderRadius: 4, color: "#4ade80", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }}>🔄 Recarregar</button>}
        </div>
        {supaStatus === "cors" && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(251,191,36,.07)", border: "1px solid rgba(251,191,36,.25)", borderRadius: 6, fontSize: 12, color: "#fbbf24", lineHeight: 1.7 }}>
            ⚠️ <strong>Credenciais salvas com sucesso!</strong><br/>
            O Claude.ai bloqueia conexões externas por segurança. O Supabase vai funcionar normalmente assim que você <strong>publicar o site no Vercel ou Netlify</strong>. Os dados ficam em modo local até lá.
          </div>
        )}
        {supaStatus === "error" && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(248,113,113,.07)", border: "1px solid rgba(248,113,113,.2)", borderRadius: 6, fontSize: 12, color: "#f87171", lineHeight: 1.7 }}>
            ❌ Falha na conexão. Verifique a URL e a chave <strong>anon legacy</strong> (começa com <code>eyJ</code>).
          </div>
        )}
      </div>
      <div style={{ ...card, marginBottom: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 12 }}>📖 Como criar sua conta Supabase (grátis)</div>
        {[["1","Acesse supabase.com e clique em Start your project"],["2","Crie conta com GitHub ou e-mail"],["3","New Project → nome (vinhos9) → senha → região São Paulo"],["4","Aguarde ~2 min o banco ser criado"],["5","SQL Editor → cole o SQL do Passo 1 → Run"],["6","Settings → API → copie Project URL e Publishable key"],["7","Cole acima no Passo 2 → Conectar"]].map(([n,t]) => (
          <div key={n} style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: 12, color: "#7a6a6a" }}>
            <span style={{ background: "#8b2c2c", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flexShrink: 0 }}>{n}</span>
            <span>{t}</span>
          </div>
        ))}
        <div style={{ marginTop: 12, padding: "10px 14px", background: "rgba(74,222,128,.05)", border: "1px solid rgba(74,222,128,.15)", borderRadius: 6, fontSize: 11, color: "#4ade80" }}>✅ Plano gratuito: 500MB de banco, suficiente para começar.</div>
      </div>
    </div>
  );
};

// ─── Painel Cupons ────────────────────────────────────────────────────────────
const CuponsPanel = ({ customCoupons, saveCoupons, showToast }) => {
  const [newCode, setNewCode] = useState("");
  const [newPct, setNewPct] = useState("");
  const [newLimit, setNewLimit] = useState("");
  const addCoupon = () => {
    const code = newCode.toUpperCase().trim();
    if (!code || !newPct || +newPct <= 0 || +newPct > 100) return showToast("Preencha código e percentual válido.", "error");
    saveCoupons({ ...customCoupons, [code]: { pct: +newPct, limit: newLimit ? +newLimit : null, uses: 0 } });
    setNewCode(""); setNewPct(""); setNewLimit(""); showToast(`Cupom ${code} criado! ✅`);
  };
  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, marginBottom: 5 }}>🎁 Gerenciar Cupons</h1>
      <p style={{ color: "#7a6a6a", fontSize: 13, marginBottom: 24 }}>Crie e remova cupons de desconto para seus clientes.</p>
      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 16 }}>Criar Novo Cupom</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Código</label>
            <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Ex: NATAL20"
              style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#fbbf24", fontSize: 14, fontFamily: "monospace", letterSpacing: 2, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Desconto (%)</label>
            <input type="number" value={newPct} onChange={e => setNewPct(e.target.value)} placeholder="Ex: 15" min="1" max="100"
              style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#4ade80", fontSize: 14, fontFamily: "Georgia,serif", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Limite de usos</label>
            <input type="number" value={newLimit} onChange={e => setNewLimit(e.target.value)} placeholder="∞ Ilimitado" min="1"
              style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#60a5fa", fontSize: 14, fontFamily: "Georgia,serif", boxSizing: "border-box" }} />
          </div>
          <button onClick={addCoupon} style={{ padding: "10px 18px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif", whiteSpace: "nowrap" }}>+ Adicionar</button>
        </div>
        <p style={{ fontSize: 11, color: "#3a2a2a", marginTop: 8 }}>Deixe "Limite de usos" vazio para cupom ilimitado.</p>
      </div>
      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 16 }}>Cupons Ativos ({Object.keys(customCoupons).length})</div>
        {Object.entries(customCoupons).map(([code, data]) => {
          const pct = typeof data === "object" ? data.pct : data;
          const limit = typeof data === "object" ? data.limit : null;
          const uses = typeof data === "object" ? (data.uses || 0) : 0;
          const esgotado = limit != null && uses >= limit;
          return (
            <div key={code} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: "1px solid #1a1410", opacity: esgotado ? 0.5 : 1 }}>
              <div style={{ background: "#120e0c", border: `1px dashed ${esgotado ? "#5a4a4a" : "#8b2c2c"}`, borderRadius: 6, padding: "6px 16px", minWidth: 110 }}>
                <span style={{ fontSize: 14, letterSpacing: 3, color: esgotado ? "#5a4a4a" : "#fbbf24", fontWeight: "bold" }}>{code}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: "#4ade80", fontWeight: "bold" }}>{pct}% OFF</div>
                <div style={{ fontSize: 11, color: "#5a4a4a", marginTop: 2 }}>
                  {limit == null
                    ? <span style={{ color: "#3a5a3a" }}>∞ Ilimitado</span>
                    : <span style={{ color: esgotado ? "#ef4444" : "#60a5fa" }}>{uses}/{limit} usos {esgotado ? "— Esgotado" : `— ${limit - uses} restantes`}</span>
                  }
                </div>
              </div>
              {/* Resetar usos */}
              {uses > 0 && (
                <button onClick={() => { saveCoupons({ ...customCoupons, [code]: { pct, limit, uses: 0 } }); showToast(`Usos de ${code} resetados.`); }}
                  style={{ background: "none", border: "1px solid #1a2a3a", color: "#60a5fa", padding: "5px 10px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>↺ Reset</button>
              )}
              <button onClick={() => { const u = { ...customCoupons }; delete u[code]; saveCoupons(u); showToast(`Cupom ${code} removido.`, "error"); }}
                style={{ background: "none", border: "1px solid #3a1f1f", color: "#ef4444", padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }}>🗑 Remover</button>
            </div>
          );
        })}
        {Object.keys(customCoupons).length === 0 && <p style={{ fontSize: 13, color: "#3a2a2a" }}>Nenhum cupom criado ainda.</p>}
      </div>
    </div>
  );
};

// ─── Painel Frete ─────────────────────────────────────────────────────────────
const FretePanel = ({ freteConfig, saveFreteConfig, showToast }) => {
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ id: "", nome: "", icon: "📦", prazo: "", base: "", minValue: "" });
  const opcoes = freteConfig.opcoes || [];
  const startEdit = (op) => { setEditando(op.id); setForm({ ...op, base: String(op.base), minValue: op.minValue != null ? String(op.minValue) : "" }); };
  const saveEdit = () => {
    const updated = opcoes.map(o => o.id === editando ? { ...form, base: +form.base || 0, minValue: form.minValue !== "" ? +form.minValue : undefined } : o);
    saveFreteConfig({ opcoes: updated }); setEditando(null); showToast("Frete atualizado! ✅");
  };
  const addOpcao = () => {
    const nova = { id: `frete_${Date.now()}`, nome: "Nova Opção", icon: "🚚", prazo: "7 dias úteis", base: 0 };
    const newOpcoes = [...opcoes, nova];
    saveFreteConfig({ opcoes: newOpcoes });
    setEditando(nova.id);
    setForm({ ...nova, base: "0", minValue: "" });
  };
  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 5 }}>🚚 Configurar Frete</h1>
      <p style={{ color: "#7a6a6a", fontSize: 13, marginBottom: 24 }}>Gerencie as opções de entrega exibidas aos clientes.</p>
      {opcoes.map(op => (
        <div key={op.id} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: `1px solid ${editando === op.id ? "#8b2c2c" : "#2a1f1f"}`, borderRadius: 10, padding: 20, marginBottom: 14 }}>
          {editando === op.id ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["nome","Nome (ex: PAC)"],["icon","Ícone (emoji)"],["prazo","Prazo (ex: 5 dias úteis)"],["base","Preço base (R$)"]].map(([f, l]) => (
                <div key={f}>
                  <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>{l}</label>
                  <input value={form[f] ?? ""} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                    style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 14, fontFamily: "Georgia,serif", boxSizing: "border-box" }} />
                </div>
              ))}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Valor mínimo para frete grátis (R$) — deixe vazio se não aplicar</label>
                <input type="number" value={form.minValue ?? ""} onChange={e => setForm(p => ({ ...p, minValue: e.target.value }))}
                  style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#fbbf24", fontSize: 14, fontFamily: "Georgia,serif", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1/-1", display: "flex", gap: 10 }}>
                <button onClick={saveEdit} style={{ padding: "9px 20px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>💾 Salvar</button>
                <button onClick={() => setEditando(null)} style={{ padding: "9px 16px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#7a6a6a", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ fontSize: 28 }}>{op.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, color: "#f5f0e8", fontWeight: "bold" }}>{op.nome}</div>
                <div style={{ fontSize: 12, color: "#7a6a6a" }}>{op.prazo} · {+op.base === 0 ? <span style={{ color: "#4ade80" }}>Grátis</span> : `R$ ${(+op.base).toFixed(2)} base`}{op.minValue ? ` · Grátis acima de R$ ${op.minValue}` : ""}</div>
              </div>
              <button onClick={() => startEdit(op)} style={{ background: "none", border: "1px solid #2a3a2a", color: "#4ade80", padding: "6px 14px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }}>✏️ Editar</button>
              <button onClick={() => { saveFreteConfig({ opcoes: opcoes.filter(o => o.id !== op.id) }); showToast("Opção removida.", "error"); }}
                style={{ background: "none", border: "1px solid #3a1f1f", color: "#ef4444", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }}>🗑</button>
            </div>
          )}
        </div>
      ))}
      <button onClick={addOpcao} style={{ marginTop: 8, padding: "10px 22px", background: "#1a1410", border: "1px solid #3a2f2f", borderRadius: 4, color: "#e8b4b4", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>+ Adicionar opção de frete</button>
    </div>
  );
};

// ─── Painel CSV com IA ────────────────────────────────────────────────────────
const CSVPanel = ({ importCSV, showToast }) => {
  const csvRef = useRef(null);
  const aiImgRef = useRef(null);
  const [aiImg, setAiImg] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCSV, setAiCSV] = useState("");
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem("v9_anthropic_key") || ""; } catch { return ""; } });
  const [showKey, setShowKey] = useState(false);

  const saveKey = (k) => { setApiKey(k); try { localStorage.setItem("v9_anthropic_key", k); } catch {} };

  const gerarCSV = async () => {
    if (!aiImg) return showToast("Selecione uma imagem primeiro.", "error");
    if (!apiKey.trim()) return showToast("Cole sua chave Anthropic API primeiro.", "error");
    setAiLoading(true); setAiCSV("");
    try {
      const base64 = aiImg.split(",")[1];
      const mime = aiImg.split(";")[0].split(":")[1];
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
            { type: "text", text: `Analise esta imagem de vinho e retorne APENAS uma linha CSV (sem cabeçalho) com os campos nesta ordem, separados por vírgula:\nname (título SEO otimizado ex: "Vinho Tinto Chileno Reserva Cabernet Sauvignon 2021"),origin,region,year,costPrice (vazio),price (estimativa em reais),promoPrice (vazio),stock (10),category (Tinto/Branco/Espumante/Rosé),alcohol,grapes,description (descrição SEO),keywords (palavras separadas por ;),harmonization (sugestões separadas por ,),rating (4.5),sales (0)\nResponda SOMENTE a linha CSV sem explicações nem markdown.` }
          ]}]
        })
      });
      const data = await resp.json();
      if (data.error) { showToast(`Erro da IA: ${data.error.message}`, "error"); setAiLoading(false); return; }
      const csv = data.content?.find(b => b.type === "text")?.text?.trim() || "";
      setAiCSV(csv);
      showToast("CSV gerado pela IA! ✅");
    } catch (e) { showToast("Erro ao chamar a IA. Verifique sua chave API.", "error"); }
    setAiLoading(false);
  };

  const baixarCSV = (linhas) => {
    const header = "name,origin,region,year,costPrice,price,promoPrice,stock,category,alcohol,grapes,description,keywords,harmonization,rating,sales\n";
    const blob = new Blob([header + linhas + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "vinho-ia.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importarDireto = async () => {
    const header = "name,origin,region,year,costPrice,price,promoPrice,stock,category,alcohol,grapes,description,keywords,harmonization,rating,sales\n";
    const blob = new Blob([header + aiCSV + "\n"], { type: "text/csv" });
    const f = new File([blob], "vinho-ia.csv", { type: "text/csv" });
    await importCSV(f);
    setAiCSV(""); setAiImg(null);
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <h1 style={{ fontSize: 21, marginBottom: 5 }}>📥 Importar Produtos via CSV</h1>
      <p style={{ color: "#7a6a6a", fontSize: 13, marginBottom: 24 }}>Importe vários vinhos de uma vez. Imagens podem ser adicionadas após a importação.</p>

      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 12 }}>📋 Template CSV</div>
        <div style={{ background: "#0c0a09", borderRadius: 6, padding: "12px 14px", fontSize: 11, color: "#5a4a4a", fontFamily: "monospace", marginBottom: 14, overflowX: "auto", whiteSpace: "nowrap" }}>
          name,origin,region,year,costPrice,price,promoPrice,stock,category,alcohol,grapes,description,keywords,harmonization,rating,sales
        </div>
        <button onClick={() => {
          const header = "name,origin,region,year,costPrice,price,promoPrice,stock,category,alcohol,grapes,description,keywords,harmonization,rating,sales\n";
          const example = ',Exemplo Vinho,Brasil,Serra Gaúcha,2022,80,149,,10,Tinto,13%,Merlot,"Vinho encorpado.",4.5,0\n';
          const blob = new Blob([header + example], { type: "text/csv" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a"); a.href = url; a.download = "template-vinhos9.csv"; a.click();
          URL.revokeObjectURL(url);
        }} style={{ padding: "9px 18px", background: "#1a1410", border: "1px solid #3a2f2f", color: "#e8b4b4", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>
          ⬇ Baixar Template CSV
        </button>
      </div>

      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "2px dashed #2a1f1f", borderRadius: 10, padding: 32, textAlign: "center", marginBottom: 20 }}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#8b2c2c"; }}
        onDragLeave={e => { e.currentTarget.style.borderColor = "#2a1f1f"; }}
        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = "#2a1f1f"; const f = e.dataTransfer.files[0]; if (f?.name.endsWith(".csv")) importCSV(f); else showToast("Envie um arquivo .csv", "error"); }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
        <p style={{ fontSize: 13, color: "#a09080", marginBottom: 16 }}>Arraste o CSV aqui ou clique para selecionar</p>
        <input type="file" accept=".csv" style={{ display: "none" }} ref={csvRef} onChange={e => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ""; }} />
        <button onClick={() => csvRef.current?.click()} style={{ padding: "10px 24px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1 }}>
          📂 Selecionar Arquivo CSV
        </button>
      </div>

      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #3a2a4a", borderRadius: 10, padding: 22 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#c084fc", textTransform: "uppercase", marginBottom: 6 }}>🤖 Gerar CSV com Inteligência Artificial</div>
        <p style={{ fontSize: 13, color: "#7a6a6a", lineHeight: 1.7, marginBottom: 16 }}>Envie a foto de um vinho e a IA gera o CSV com <strong style={{ color: "#e8b4b4" }}>título SEO otimizado</strong> automaticamente.</p>

        {/* Chave API */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
            🔑 Chave Anthropic API — <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ color: "#c084fc", textDecoration: "none" }}>Obter em console.anthropic.com</a>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => saveKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              style={{ flex: 1, background: "#0c0a09", border: "1px solid #3a2a4a", borderRadius: 4, padding: "9px 12px", color: "#c084fc", fontSize: 13, fontFamily: "monospace" }}
            />
            <button onClick={() => setShowKey(s => !s)} style={{ padding: "9px 14px", background: "#1a1410", border: "1px solid #3a2a4a", borderRadius: 4, color: "#7a6a6a", cursor: "pointer", fontSize: 13 }}>
              {showKey ? "🙈" : "👁"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#3a2a4a", marginTop: 5 }}>A chave fica salva localmente no seu navegador.</div>
        </div>
        <input type="file" accept="image/*" ref={aiImgRef} style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setAiImg(ev.target.result); r.readAsDataURL(f); }} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <button onClick={() => aiImgRef.current?.click()} style={{ padding: "10px 18px", background: "#1a1410", border: "1px solid #3a2f4a", color: "#c084fc", borderRadius: 4, cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>🖼 Selecionar Imagem</button>
            {aiImg && <div style={{ marginTop: 10 }}><img src={aiImg} alt="preview" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #3a2a4a" }} /></div>}
          </div>
          <button onClick={gerarCSV} disabled={!aiImg || aiLoading}
            style={{ padding: "10px 22px", background: aiLoading ? "#2a1f2a" : "#6d28d9", border: "none", borderRadius: 4, color: "#fff", cursor: aiImg && !aiLoading ? "pointer" : "not-allowed", fontSize: 13, fontFamily: "Georgia,serif", letterSpacing: 1 }}>
            {aiLoading ? "⏳ Analisando…" : "✨ Gerar CSV com IA"}
          </button>
        </div>
        {aiCSV && (
          <div>
            <div style={{ fontSize: 11, color: "#5a4a4a", marginBottom: 6, letterSpacing: 1, textTransform: "uppercase" }}>CSV gerado:</div>
            <div style={{ background: "#0c0a09", borderRadius: 6, padding: "10px 14px", fontSize: 11, color: "#4ade80", fontFamily: "monospace", marginBottom: 12, wordBreak: "break-all", lineHeight: 1.6 }}>{aiCSV}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => baixarCSV(aiCSV)} style={{ padding: "9px 18px", background: "#1a3a1a", border: "1px solid #4ade80", borderRadius: 4, color: "#4ade80", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>⬇ Baixar CSV</button>
              <button onClick={importarDireto} style={{ padding: "9px 18px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>📥 Importar direto</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Painel Segurança (componente próprio para evitar hook em IIFE) ───────────
// ─── Painel Galeria de Imagens ────────────────────────────────────────────────
const GaleriaPanel = ({ supaCfg, wines, setWines, supaFetch, showToast }) => {
  const [imgs, setImgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setLoading(true);
    if (!supaCfg) { setLoading(false); return; }
    try {
      const c = supaCfg;
      const r = await fetch(`${c.url}/storage/v1/object/list/wines`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": c.key, "Authorization": `Bearer ${c.key}` },
        body: JSON.stringify({ prefix: "", limit: 200, offset: 0 })
      });
      const data = await r.json();
      if (Array.isArray(data)) {
        const list = data.filter(f => f.name && !f.name.endsWith("/")).map(f => ({
          name: f.name,
          url: `${c.url}/storage/v1/object/public/wines/${f.name}`,
          size: f.metadata?.size || 0,
        }));
        setImgs(list.map(img => {
          const wine = wines.find(w => w.img && w.img.includes(img.name));
          return { ...img, wine };
        }));
      } else { setImgs([]); }
    } catch { setImgs([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (img) => {
    if (!confirm(`Deletar imagem "${img.name}"?\n${img.wine ? `⚠️ Associada ao vinho: ${img.wine.name}` : "Não está associada a nenhum vinho."}`)) return;
    setDeleting(img.name);
    try {
      const c = supaCfg;
      const r = await fetch(`${c.url}/storage/v1/object/wines/${img.name}`, {
        method: "DELETE",
        headers: { "apikey": c.key, "Authorization": `Bearer ${c.key}` }
      });
      if (r.ok) {
        if (img.wine) {
          await supaFetch("wines", "PATCH", { img: null }, `id=eq.${img.wine.id}`, supaCfg);
          setWines(prev => prev.map(w => w.id === img.wine.id ? { ...w, img: null } : w));
        }
        setImgs(prev => prev.filter(i => i.name !== img.name));
        showToast("Imagem deletada! ✅");
      } else { showToast("Erro ao deletar imagem.", "error"); }
    } catch { showToast("Erro ao deletar imagem.", "error"); }
    setDeleting(null);
  };

  const fmtSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)} MB` : `${Math.round(b/1024)} KB`;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>🖼 Galeria de Imagens</h1>
          <p style={{ color: "#7a6a6a", fontSize: 13 }}>{loading ? "Carregando…" : `${imgs.length} imagem${imgs.length !== 1 ? "s" : ""} no Supabase Storage`}</p>
        </div>
        <button onClick={load} style={{ padding: "8px 16px", background: "#1a1410", border: "1px solid #3a2f2f", borderRadius: 4, color: "#a09080", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif" }}>🔄 Recarregar</button>
      </div>
      {!supaCfg && <div style={{ padding: 20, background: "rgba(139,44,44,.08)", border: "1px solid rgba(139,44,44,.3)", borderRadius: 8, color: "#8b6060", fontSize: 13 }}>⚠️ Configure o Supabase primeiro na aba Banco de Dados.</div>}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {[...Array(6)].map((_, i) => <div key={i} style={{ background: "#1a1410", borderRadius: 10, height: 220 }} />)}
        </div>
      )}
      {!loading && imgs.length === 0 && supaCfg && (
        <div style={{ textAlign: "center", padding: 60, color: "#3a2a2a", fontSize: 14 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🖼</div>
          Nenhuma imagem no Storage.<br />
          <span style={{ fontSize: 12 }}>Cadastre vinhos com foto para vê-las aqui.</span>
        </div>
      )}
      {!loading && imgs.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          {imgs.map(img => (
            <div key={img.name} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, overflow: "hidden", transition: "border-color .2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#8b2c2c"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#2a1f1f"}>
              <div style={{ position: "relative", width: "100%", height: 160, background: "#0c0a09", overflow: "hidden" }}>
                <img src={img.url} alt={img.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                {img.wine && <div style={{ position: "absolute", top: 6, left: 6, background: "rgba(139,44,44,.85)", borderRadius: 4, padding: "2px 7px", fontSize: 10, color: "#fff" }}>🍷 Vinculada</div>}
              </div>
              <div style={{ padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#7a6a6a", marginBottom: 4, wordBreak: "break-all", lineHeight: 1.4 }}>{img.name}</div>
                {img.wine && <div style={{ fontSize: 11, color: "#e8b4b4", marginBottom: 4 }}>📦 {img.wine.name.slice(0, 22)}{img.wine.name.length > 22 ? "…" : ""}</div>}
                {img.size > 0 && <div style={{ fontSize: 10, color: "#3a2a2a", marginBottom: 8 }}>{fmtSize(img.size)}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={img.url} target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", padding: "6px", background: "#1a2a3a", border: "1px solid #2a3a4a", borderRadius: 4, color: "#60a5fa", fontSize: 11, textDecoration: "none", fontFamily: "Georgia,serif" }}>🔗 Ver</a>
                  <button onClick={() => handleDelete(img)} disabled={deleting === img.name}
                    style={{ flex: 1, padding: "6px", background: deleting === img.name ? "#1a1410" : "#2a1010", border: "1px solid #3a1f1f", borderRadius: 4, color: deleting === img.name ? "#5a4a4a" : "#ef4444", cursor: deleting === img.name ? "not-allowed" : "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>
                    {deleting === img.name ? "⏳" : "🗑 Del"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── EmailJS utility ──────────────────────────────────────────────────────────
const getEmailConfig = () => { try { const s = localStorage.getItem("v9_emailjs"); return s ? JSON.parse(s) : null; } catch { return null; } };

const sendEmail = async (templateId, params) => {
  const cfg = getEmailConfig();
  if (!cfg?.serviceId || !cfg?.publicKey) return false;
  const tid = cfg.templates?.[templateId] || "";
  if (!tid) return false;
  try {
    const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: tid,
        user_id: cfg.publicKey,
        accessToken: cfg.publicKey,
        template_params: params
      })
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => r.status);
      console.error("EmailJS error:", r.status, txt);
    }
    return r.ok;
  } catch (e) { console.error("EmailJS fetch error:", e); return false; }
};

// ─── Painel E-mails ───────────────────────────────────────────────────────────
const EmailPanel = ({ showToast }) => {
  const [cfg, setCfg] = useState(() => getEmailConfig() || { serviceId: "", publicKey: "", templates: { boasVindas: "", pedidoConfirmado: "", pedidoTransito: "", pedidoEntregue: "", resetSenha: "" } });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(null);
  const [testEmail, setTestEmail] = useState("");

  const save = () => { try { localStorage.setItem("v9_emailjs", JSON.stringify(cfg)); setSaved(true); setTimeout(() => setSaved(false), 2000); showToast("Configurações de e-mail salvas! ✅"); } catch {} };

  const testSend = async (templateKey) => {
    if (!testEmail) return showToast("Informe um e-mail para teste.", "error");
    if (!cfg.serviceId || !cfg.publicKey) return showToast("Salve o Service ID e a Public Key primeiro.", "error");
    const tid = cfg.templates?.[templateKey];
    if (!tid) return showToast("Preencha o Template ID deste e-mail primeiro.", "error");
    setTesting(templateKey);
    const params = {
      to_email: testEmail, to_name: "Cliente Teste",
      store_name: "Vinhos9", order_id: "#0001",
      order_items: "Vinho Tinto Reserva × 1", order_total: "R$ 149,90",
      order_date: new Date().toLocaleDateString("pt-BR"),
      points_earned: "149", points_total: "349",
      reset_link: window.location.origin + "?reset=true",
      coupon_code: "BEMVINDO",
    };
    // Chama diretamente para pegar erro detalhado
    try {
      const r = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_id: cfg.serviceId, template_id: tid, user_id: cfg.publicKey, accessToken: cfg.publicKey, template_params: params })
      });
      if (r.ok) {
        showToast(`✅ E-mail de teste enviado para ${testEmail}!`);
      } else {
        const txt = await r.text().catch(() => `HTTP ${r.status}`);
        showToast(`Erro ${r.status}: ${txt}`, "error");
      }
    } catch (e) {
      showToast(`Erro de conexão: ${e.message}`, "error");
    }
    setTesting(null);
  };

  const TEMPLATES = [
    { key: "boasVindas",       icon: "🎉", label: "Boas-vindas",           desc: "Enviado ao criar conta. Inclui cupom BEMVINDO.", vars: "to_email, to_name, store_name, coupon_code" },
    { key: "pedidoConfirmado", icon: "✅", label: "Pedido Confirmado",      desc: "Enviado ao finalizar a compra.", vars: "to_email, to_name, order_id, order_items, order_total, order_date, points_earned, points_total" },
    { key: "pedidoTransito",   icon: "🚚", label: "Pedido em Trânsito",     desc: "Enviado quando status muda para Em trânsito.", vars: "to_email, to_name, order_id, order_date" },
    { key: "pedidoEntregue",   icon: "📦", label: "Pedido Entregue",        desc: "Enviado quando status muda para Entregue.", vars: "to_email, to_name, order_id, order_total, points_earned" },
    { key: "resetSenha",       icon: "🔑", label: "Redefinição de Senha",   desc: "Enviado ao solicitar nova senha.", vars: "to_email, to_name, reset_link" },
  ];

  const inp = (label, field, placeholder) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>{label}</label>
      <input value={cfg[field] || ""} onChange={e => setCfg(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder}
        style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
    </div>
  );

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 24, marginBottom: 5 }}>📧 Configurar E-mails Automáticos</h1>
      <p style={{ color: "#7a6a6a", fontSize: 13, marginBottom: 24, lineHeight: 1.7 }}>
        Use o <a href="https://www.emailjs.com" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>EmailJS</a> para enviar e-mails automáticos sem servidor. Gratuito até 200 e-mails/mês.
      </p>

      {/* Guia de configuração */}
      <div style={{ background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.2)", borderRadius: 10, padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#60a5fa", textTransform: "uppercase", marginBottom: 12 }}>📋 Como configurar o EmailJS</div>
        {[
          ["1", "Acesse emailjs.com e crie uma conta gratuita"],
          ["2", "Vá em Email Services → Add New Service → escolha Gmail ou outro"],
          ["3", "Copie o Service ID e cole abaixo"],
          ["4", "Vá em Email Templates → Create New Template para cada tipo de e-mail"],
          ["5", "No template use as variáveis listadas (ex: {{to_name}}, {{order_id}})"],
          ["6", "Copie o Template ID de cada um e cole nos campos abaixo"],
          ["7", "Em Account → API Keys copie a Public Key"],
        ].map(([n, text]) => (
          <div key={n} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
            <span style={{ background: "#1a2a3a", color: "#60a5fa", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0 }}>{n}</span>
            <span style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.6 }}>{text}</span>
          </div>
        ))}
      </div>

      {/* Credenciais */}
      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 20 }}>
        <div style={{ fontSize: 12, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 16 }}>🔑 Credenciais EmailJS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {inp("Service ID", "serviceId", "service_xxxxxxx")}
          {inp("Public Key", "publicKey", "xxxxxxxxxxxxxxxxxxxxxx")}
        </div>
        {/* E-mail de teste */}
        <div style={{ marginTop: 4, marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>E-mail para teste</label>
          <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="seu@email.com"
            style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", boxSizing: "border-box" }} />
        </div>
        <button onClick={save}
          style={{ padding: "10px 24px", background: saved ? "#1a3a1a" : "#8b2c2c", border: "none", borderRadius: 4, color: saved ? "#4ade80" : "#fff", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif", letterSpacing: 1, transition: "all .3s" }}>
          {saved ? "✅ Salvo!" : "💾 Salvar Credenciais"}
        </button>
      </div>

      {/* Templates */}
      <div style={{ fontSize: 12, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 16 }}>📨 Templates de E-mail</div>
      {TEMPLATES.map(({ key, icon, label, desc, vars }) => (
        <div key={key} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 14, color: "#f5f0e8", marginBottom: 4 }}>{icon} {label}</div>
              <div style={{ fontSize: 11, color: "#5a4a4a", marginBottom: 6 }}>{desc}</div>
              <div style={{ fontSize: 10, color: "#3a2a3a", background: "#1a0e1a", borderRadius: 4, padding: "4px 8px", fontFamily: "monospace" }}>
                Variáveis: {vars}
              </div>
            </div>
            <button onClick={() => testSend(key)} disabled={testing === key || !cfg.serviceId || !cfg.publicKey}
              style={{ padding: "7px 14px", background: testing === key ? "#2a1f2a" : "#1a1a2a", border: "1px solid #3a3a5a", borderRadius: 4, color: testing === key ? "#5a4a5a" : "#a0a0e8", cursor: testing === key ? "not-allowed" : "pointer", fontSize: 11, fontFamily: "Georgia,serif", whiteSpace: "nowrap" }}>
              {testing === key ? "⏳ Enviando…" : "🧪 Testar"}
            </button>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Template ID</label>
            <input value={cfg.templates?.[key] || ""} onChange={e => setCfg(p => ({ ...p, templates: { ...p.templates, [key]: e.target.value } }))} placeholder="template_xxxxxxx"
              style={{ width: "100%", background: "#0c0a09", border: `1px solid ${cfg.templates?.[key] ? "#2a3a2a" : "#2a1f1f"}`, borderRadius: 4, padding: "9px 12px", color: cfg.templates?.[key] ? "#4ade80" : "#7a6a6a", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box" }} />
          </div>
        </div>
      ))}
      <button onClick={save}
        style={{ width: "100%", padding: "12px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "Georgia,serif", letterSpacing: 2, textTransform: "uppercase" }}>
        💾 Salvar Todas as Configurações
      </button>
    </div>
  );
};

const SegurancaPanel = ({ showToast }) => {
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPassConfirm, setNewPassConfirm] = useState("");
  const [secMsg, setSecMsg] = useState(null);
  const [showNewPass, setShowNewPass] = useState(false);
  const passStrength = (p) => {
    if (!p) return null;
    let score = 0;
    if (p.length >= 8) score++; if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++; if (/[0-9]/.test(p)) score++; if (/[^a-zA-Z0-9]/.test(p)) score++;
    if (score <= 1) return { label: "Fraca", color: "#f87171" };
    if (score <= 3) return { label: "Média", color: "#fbbf24" };
    return { label: "Forte", color: "#4ade80" };
  };
  const strength = passStrength(newPass);
  const handleSave = () => {
    if (!newUser.trim() || newUser.length < 4) { setSecMsg({ type: "error", text: "Usuário deve ter ao menos 4 caracteres." }); return; }
    if (newPass.length < 8) { setSecMsg({ type: "error", text: "Senha deve ter ao menos 8 caracteres." }); return; }
    if (newPass !== newPassConfirm) { setSecMsg({ type: "error", text: "As senhas não coincidem." }); return; }
    if (strength?.label === "Fraca") { setSecMsg({ type: "error", text: "Escolha uma senha mais forte." }); return; }
    saveAdmHash(newUser.trim(), newPass);
    setNewUser(""); setNewPass(""); setNewPassConfirm("");
    setSecMsg({ type: "success", text: "✅ Credenciais atualizadas! Use-as no próximo login." });
  };
  const inputStyle = { width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" };
  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: 21, marginBottom: 5 }}>🔐 Segurança</h1>
      <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 24 }}>Altere as credenciais de acesso ao painel administrativo.</p>
      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 18 }}>Alterar Credenciais do ADM</div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Novo Usuário</label>
          <input value={newUser} onChange={e => setNewUser(e.target.value)} placeholder="Mínimo 4 caracteres" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Nova Senha</label>
          <div style={{ position: "relative" }}>
            <input type={showNewPass ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Mínimo 8 caracteres" style={{ ...inputStyle, paddingRight: 40 }} />
            <button onClick={() => setShowNewPass(p => !p)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 13 }}>{showNewPass ? "🙈" : "👁"}</button>
          </div>
          {strength && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 4, background: "#1a1410", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: strength.label === "Fraca" ? "33%" : strength.label === "Média" ? "66%" : "100%", height: "100%", background: strength.color, transition: "width .3s" }} />
              </div>
              <span style={{ fontSize: 10, color: strength.color }}>{strength.label}</span>
            </div>
          )}
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Confirmar Nova Senha</label>
          <input type="password" value={newPassConfirm} onChange={e => setNewPassConfirm(e.target.value)} placeholder="Repita a senha"
            style={{ ...inputStyle, border: `1px solid ${newPassConfirm && newPassConfirm !== newPass ? "#f87171" : "#2a1f1f"}` }} />
          {newPassConfirm && newPassConfirm !== newPass && <div style={{ fontSize: 10, color: "#f87171", marginTop: 4 }}>As senhas não coincidem</div>}
        </div>
        {secMsg && <div style={{ marginBottom: 14, padding: "10px 14px", background: secMsg.type === "success" ? "rgba(74,222,128,.07)" : "rgba(248,113,113,.07)", border: `1px solid ${secMsg.type === "success" ? "rgba(74,222,128,.2)" : "rgba(248,113,113,.2)"}`, borderRadius: 6, fontSize: 12, color: secMsg.type === "success" ? "#4ade80" : "#f87171" }}>{secMsg.text}</div>}
        <button onClick={handleSave} style={{ padding: "11px 24px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1 }}>💾 Salvar Credenciais</button>
      </div>
      <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 14 }}>Proteções Ativas</div>
        {[["✅","Senhas armazenadas como hash (não reversível)"],["✅","Bloqueio após 5 tentativas incorretas (60s)"],["✅","Chaves do gateway salvas localmente (não no código)"],["✅","Campos sanitizados contra XSS"],["✅","HTTPS obrigatório via Vercel/Netlify"],["⚠️","Backend real recomendado para produção com vendas"]].map(([icon, text]) => (
          <div key={text} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 12, color: icon === "⚠️" ? "#fbbf24" : "#7a6a6a" }}>
            <span>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  const [page, setPage] = useState("store");
  const [adminTab, setAdminTab] = useState("dashboard");
  const [wines, setWines] = useState(INITIAL_WINES);
  const [cart, setCart] = useState([]);
  const [filter, setFilter] = useState("Todos");
  const [countryFilter, setCountryFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedWine, setSelectedWine] = useState(null);
  const [orders, setOrders] = useState(INITIAL_ORDERS);
  const [reviews, setReviews] = useState(INITIAL_REVIEWS);
  const [toast, setToast] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [banners, setBanners] = useState(INITIAL_BANNERS);
  const [highlightIds, setHighlightIds] = useState(INITIAL_HIGHLIGHT_WINES);
  const [heroBanner, setHeroBanner] = useState(INITIAL_HERO_BANNER);
  const [clientPanelOpen, setClientPanelOpen] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [editWine, setEditWine] = useState(null);
  // 🎁 Cupons — agora editáveis
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [customCoupons, setCustomCoupons] = useState(() => {
    try {
      const s = localStorage.getItem("v9_coupons");
      if (s) {
        const parsed = JSON.parse(s);
        // migrar formato antigo { CODE: 10 } para novo { CODE: { pct, limit, uses } }
        const migrated = {};
        Object.entries(parsed).forEach(([k, v]) => {
          migrated[k] = typeof v === "object" ? v : { pct: v, limit: null, uses: 0 };
        });
        return migrated;
      }
    } catch {}
    return { "VINO10": { pct: 10, limit: null, uses: 0 }, "VINO20": { pct: 20, limit: null, uses: 0 }, "BEMVINDO": { pct: 5, limit: null, uses: 0 } };
  });
  const COUPONS = customCoupons;
  const saveCoupons = (c) => { setCustomCoupons(c); try { localStorage.setItem("v9_coupons", JSON.stringify(c)); } catch {} };
  // Helper para pegar % do cupom
  const couponPct = (code) => { const c = COUPONS[code]; return c ? (typeof c === "object" ? c.pct : c) : 0; };
  const couponValid = (code) => { const c = COUPONS[code]; if (!c) return false; if (typeof c !== "object") return true; return c.limit == null || c.uses < c.limit; };
  // 🚚 Frete configurável
  const [freteConfig, setFreteConfig] = useState(() => { try { const s = localStorage.getItem("v9_frete"); return s ? JSON.parse(s) : { opcoes: [{ id: "pac", nome: "PAC", icon: "📦", prazo: "5 dias úteis", base: 18 }, { id: "sedex", nome: "SEDEX", icon: "⚡", prazo: "2 dias úteis", base: 32 }, { id: "gratis", nome: "Frete Grátis", icon: "🎁", prazo: "7 dias úteis", base: 0, minValue: 500 }] }; } catch { return { opcoes: [] }; } });
  const saveFreteConfig = (cfg) => { setFreteConfig(cfg); try { localStorage.setItem("v9_frete", JSON.stringify(cfg)); } catch {} };
  // 📊 Visitas por produto
  const [wineVisits, setWineVisits] = useState(() => { try { const s = localStorage.getItem("v9_visits"); return s ? JSON.parse(s) : {}; } catch { return {}; } });
  const trackVisit = (wineId) => { setWineVisits(prev => { const n = { ...prev, [wineId]: (prev[wineId] || 0) + 1 }; try { localStorage.setItem("v9_visits", JSON.stringify(n)); } catch {} return n; }); };
  // 🔍 Filtro de preço
  const [priceRange, setPriceRange] = useState([0, 3000]);
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState("default");
  const [wishlist, setWishlist] = useState([]);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [zoomWine, setZoomWine] = useState(null);
  const [reviewedWines, setReviewedWines] = useState(new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [supaCfg, setSupaCfg] = useState(() => getSupaCfg());
  const [supaStatus, setSupaStatus] = useState("idle");
  const [supaConnected, setSupaConnected] = useState(false);
  const [dbLoading, setDbLoading] = useState(true);
  const [paymentGateway, setPaymentGateway] = useState(() => { try { return localStorage.getItem("v9_gw") || "mercadopago"; } catch { return "mercadopago"; } });
  const [paymentKeys, setPaymentKeys] = useState(() => { try { const s = localStorage.getItem("v9_keys"); return s ? JSON.parse(s) : {}; } catch { return {}; } });
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  // 🔗 URL persistence — lê ?produto=ID e abre o produto correto (funciona com Supabase async)
  const pendingProductId = useRef((() => { try { return new URLSearchParams(window.location.search).get("produto"); } catch { return null; } })());

  useEffect(() => {
    if (!pendingProductId.current || wines.length === 0) return;
    const pid = pendingProductId.current;
    const found = wines.find(w => String(w.id) === pid);
    if (found) {
      setSelectedWine(found);
      setPage("store");
      pendingProductId.current = null; // só abre uma vez
    }
  }, [wines]);

  useEffect(() => {
    if (selectedWine) {
      const url = new URL(window.location.href);
      url.searchParams.set("produto", selectedWine.id);
      window.history.replaceState(null, "", url.toString());
      trackVisit(selectedWine.id);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.delete("produto");
      window.history.replaceState(null, "", url.toString());
    }
  }, [selectedWine]);

  // ── Supabase: carregar dados ao conectar ─────────────────────────────────
  const loadFromSupabase = useCallback(async (cfg) => {
    if (!cfg?.url || !cfg?.key) return;
    setDbLoading(true);
    const [winesData, ordersData, reviewsData] = await Promise.all([
      supa.wines.list(cfg),
      supa.orders.list(cfg),
      supa.reviews.list(cfg),
    ]);
    if (winesData && winesData !== "cors_blocked") {
      setWines(winesData.map(w => ({
        ...w,
        promoPrice: w.promo_price,
        costPrice: w.cost_price,
        description: w.description || "",
        keywords: w.keywords || "",
        harmonization: w.harmonization || "",
        img: w.img || getImgLocal(w.id) || null, // usa URL do Storage, fallback localStorage
      })));
      setSupaConnected(true);
    }
    if (Array.isArray(ordersData))  setOrders(ordersData);
    if (Array.isArray(reviewsData)) setReviews(reviewsData.map(r => ({ ...r, wineId: r.wine_id })));
    setDbLoading(false);
  }, []);

  useEffect(() => { if (supaCfg) loadFromSupabase(supaCfg); }, [supaCfg]);

  // ── Supabase: testar conexão ─────────────────────────────────────────────
  const testSupaConnection = async (url, key) => {
    setSupaStatus("testing");
    const cfg = { url: url.replace(/\/$/, ""), key };
    const result = await supa.wines.list(cfg);
    if (result === "cors_blocked") {
      // Credenciais salvas mesmo assim — vai funcionar quando publicado
      saveSupaCfg(url, key); setSupaCfg(cfg); setSupaStatus("cors");
    } else if (result !== null) {
      saveSupaCfg(url, key); setSupaCfg(cfg); setSupaStatus("ok"); loadFromSupabase(cfg);
    } else {
      setSupaStatus("error");
    }
  };

  // ── Supabase: wrapper para operações com fallback local ──────────────────
  // Salva imagem localmente como fallback
  const saveImgLocal = (id, img) => { try { if (img) localStorage.setItem(`v9_img_${id}`, img); } catch {} };
  const getImgLocal = (id) => { try { return localStorage.getItem(`v9_img_${id}`) || null; } catch { return null; } };
  const removeImgLocal = (id) => { try { localStorage.removeItem(`v9_img_${id}`); } catch {} };

  const dbAddWine = async (wine) => {
    if (!supaCfg) { showToast("Supabase não configurado.", "error"); return null; }

    // 1. Insere o vinho SEM imagem primeiro para obter o ID
    const w = {
      name: wine.name, origin: wine.origin || "", region: wine.region || "",
      year: wine.year ? +wine.year : null, cost_price: +wine.costPrice || 0,
      price: +wine.price, promo_price: wine.promoPrice ? +wine.promoPrice : null,
      stock: +wine.stock || 0, category: wine.category || "Tinto",
      alcohol: wine.alcohol || "", grapes: wine.grapes || "",
      description: wine.description || "", keywords: wine.keywords || "",
      harmonization: wine.harmonization || "", img: null, rating: 4.5, sales: 0,
    };
    const r = await supa.wines.insert(w, supaCfg);
    if (r === "cors_blocked") { showToast("CORS: só funciona após publicar no Vercel.", "error"); return null; }
    if (!r?.[0]) { showToast("Erro ao salvar no banco. Tente novamente.", "error"); return null; }

    const saved = { ...r[0], promoPrice: r[0].promo_price, costPrice: r[0].cost_price, keywords: r[0].keywords || "", harmonization: r[0].harmonization || "", img: null };

    // 2. Se tem imagem, faz upload para Storage e atualiza só o campo img
    if (wine.img) {
      showToast("Enviando imagem…");
      const imgUrl = await supaUploadImage(wine.img, saved.id, supaCfg);
      if (imgUrl) {
        // PATCH só o campo img usando filtro correto
        await supaFetch("wines", "PATCH", { img: imgUrl }, `id=eq.${saved.id}`, supaCfg);
        saved.img = imgUrl;
        showToast("Vinho e imagem salvos! ✅");
      } else {
        saveImgLocal(saved.id, wine.img);
        saved.img = wine.img;
        showToast("Vinho salvo! Imagem em modo local (verifique o bucket Storage).", "error");
      }
    }
    return saved;
  };

  const dbUpdateWine = async (wine) => {
    if (!supaCfg) return;
    let imgUrl = wine.img;

    if (wine.img && wine.img.startsWith("data:")) {
      const uploaded = await supaUploadImage(wine.img, wine.id, supaCfg);
      if (uploaded) { imgUrl = uploaded; removeImgLocal(wine.id); }
      else saveImgLocal(wine.id, wine.img);
    } else if (!wine.img) {
      removeImgLocal(wine.id);
    }

    // NUNCA enviar o campo 'id' no body do PATCH — Supabase rejeita
    const { id, ...rest } = wine;
    const w = {
      name: rest.name, origin: rest.origin || "", region: rest.region || "",
      year: rest.year ? +rest.year : null, cost_price: +rest.costPrice || 0,
      price: +rest.price, promo_price: rest.promoPrice ? +rest.promoPrice : null,
      stock: +rest.stock || 0, category: rest.category || "Tinto",
      alcohol: rest.alcohol || "", grapes: rest.grapes || "",
      description: rest.description || "", keywords: rest.keywords || "",
      harmonization: rest.harmonization || "", img: imgUrl || null,
    };
    await supaFetch("wines", "PATCH", w, `id=eq.${id}`, supaCfg);
  };
  const dbDeleteWine = async (id) => {
    removeImgLocal(id);
    const wine = wines.find(w => w.id === id);
    if (wine?.img && wine.img.startsWith("http")) supaDeleteImage(wine.img, supaCfg);
    if (supaCfg) await supa.wines.delete(id, supaCfg);
  };
  const dbInsertOrder = async (order) => {
    if (supaCfg) await supa.orders.insert(order, supaCfg);
  };
  const dbInsertReview = async (review) => {
    const r = { ...review, wine_id: review.wineId };
    if (supaCfg) await supa.reviews.insert(r, supaCfg);
  };
  const dbUpdateReview = async (review) => {
    if (supaCfg) await supa.reviews.update(review, supaCfg);
  };
  const dbDeleteReview = async (id) => {
    if (supaCfg) await supa.reviews.delete(id, supaCfg);
  };

  // Sanitização básica contra XSS
  const sanitize = (str) => String(str ?? "").replace(/[<>"'`]/g, "");

  // Validação de CPF
  const validarCPF = (cpf) => {
    const c = cpf.replace(/\D/g, "");
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    let s = 0;
    for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
    let r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
    if (r !== +c[9]) return false;
    s = 0;
    for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
    r = (s * 10) % 11; if (r === 10 || r === 11) r = 0;
    return r === +c[10];
  };
  // 🧾 Checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const emptyCheckout = { nome: "", cpf: "", contato: "", cep: "", rua: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" };
  const [checkoutData, setCheckoutData] = useState(emptyCheckout);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1=dados, 2=confirmação, 3=sucesso
  const emptyWine = { name: "", origin: "", region: "", year: "", costPrice: "", price: "", promoPrice: "", stock: "", category: "Tinto", description: "", alcohol: "", grapes: "", img: null, keywords: "", harmonization: "" };
  const [newWine, setNewWine] = useState(emptyWine);
  const newImgRef = useRef();
  const editImgRef = useRef();

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };

  // Render form fields inline (never as a child component) to prevent focus loss on re-render
  const renderFormFields = (obj, setObj, imgRef) => {
    const inp = (field, label, type = "text", span = false, extra = {}) => (
      <div key={field} style={span ? { gridColumn: "1/-1" } : {}}>
        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>{label}</label>
        <input type={type} value={obj[field] ?? ""} onChange={(e) => setObj((p) => ({ ...p, [field]: e.target.value }))}
          style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", ...extra }} />
      </div>
    );
    const c = +obj.costPrice || 0, s = +obj.price || 0;
    const mg = s > 0 ? (((s - c) / s) * 100).toFixed(1) : "0.0";
    const lc = Math.max(0, s - c);
    const mgCol = parseFloat(mg) >= 35 ? "#4ade80" : parseFloat(mg) >= 20 ? "#fbbf24" : "#f87171";
    return (
      <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {inp("name",    "Nome do Vinho",    "text",   true)}
        {/* País de Origem — dropdown com países comuns + opção personalizada */}
        <div>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>País de Origem</label>
          <select value={["Argentina","Brasil","Chile","Portugal","França","Itália","Espanha","África do Sul","EUA","Uruguai","Austrália","Alemanha","Outro"].includes(obj.origin) || !obj.origin ? (obj.origin || "") : "Outro"}
            onChange={e => setObj(p => ({ ...p, origin: e.target.value === "Outro" ? "" : e.target.value }))}
            style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", marginBottom: 6 }}>
            <option value="">Selecione…</option>
            {["🇦🇷 Argentina","🇧🇷 Brasil","🇨🇱 Chile","🇵🇹 Portugal","🇫🇷 França","🇮🇹 Itália","🇪🇸 Espanha","🇿🇦 África do Sul","🇺🇸 EUA","🇺🇾 Uruguai","🇦🇺 Austrália","🇩🇪 Alemanha"].map(p => {
              const name = p.split(" ").slice(1).join(" ");
              return <option key={name} value={name}>{p}</option>;
            })}
            <option value="Outro">✏️ Outro país…</option>
          </select>
          {(["Argentina","Brasil","Chile","Portugal","França","Itália","Espanha","África do Sul","EUA","Uruguai","Austrália","Alemanha"].includes(obj.origin) ? false : obj.origin !== undefined) && (
            <input type="text" value={obj.origin || ""} onChange={e => setObj(p => ({ ...p, origin: e.target.value }))} placeholder="Ex: Nova Zelândia"
              style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
          )}
        </div>
        {inp("region",  "Região",           "text",   false)}
        {inp("year",    "Safra",            "number", false)}
        {inp("costPrice","Preço de Custo (R$)","number",false)}
        {inp("price",   "Preço de Venda (R$)","number",false)}
        {/* Promo */}
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>
            Preço Promocional (R$) <span style={{ color: "#8b6060", fontSize: 8 }}>— deixe vazio para sem promoção</span>
          </label>
          <input type="number" value={obj.promoPrice ?? ""} onChange={(e) => setObj((p) => ({ ...p, promoPrice: e.target.value }))} placeholder="Ex: 349"
            style={{ width: "100%", background: obj.promoPrice ? "#1a1505" : "#120e0c", border: `1px solid ${obj.promoPrice ? "#5a4a10" : "#2a1f1f"}`, borderRadius: 4, padding: "9px 11px", color: "#fbbf24", fontSize: 13, fontFamily: "Georgia,serif" }} />
        </div>
        {/* Profit preview */}
        {(obj.costPrice || obj.price) ? (
          <div style={{ gridColumn: "1/-1", background: "#0e0a0a", border: "1px solid #2a1f1f", borderRadius: 8, padding: "12px 16px", display: "flex", gap: 28, flexWrap: "wrap" }}>
            <div><div style={{ fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 3 }}>Lucro / garrafa</div><div style={{ fontSize: 18, color: mgCol, fontWeight: "bold" }}>{fmt(lc)}</div></div>
            <div><div style={{ fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 3 }}>Margem</div><div style={{ fontSize: 18, color: mgCol, fontWeight: "bold" }}>{mg}%</div></div>
            {obj.stock > 0 && <div><div style={{ fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 3 }}>Lucro potencial</div><div style={{ fontSize: 18, color: "#e8b4b4", fontWeight: "bold" }}>{fmt(lc * (+obj.stock || 0))}</div></div>}
            {obj.promoPrice && +obj.promoPrice < +obj.price && <div><div style={{ fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 3 }}>Desconto</div><div style={{ fontSize: 18, color: "#fbbf24", fontWeight: "bold" }}>-{discountPct(+obj.price, +obj.promoPrice)}%</div></div>}
          </div>
        ) : null}
        {inp("stock",   "Estoque",          "number", false)}
        {/* Categoria */}
        <div>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Categoria</label>
          <select value={obj.category ?? "Tinto"} onChange={(e) => setObj((p) => ({ ...p, category: e.target.value }))}
            style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }}>
            {["Tinto","Branco","Espumante","Rosé"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {inp("alcohol", "Teor Alcoólico",   "text",   false)}
        {inp("grapes",  "Uvas",             "text",   true)}
        {/* Descrição */}
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Descrição</label>
          <textarea value={obj.description ?? ""} onChange={(e) => setObj((p) => ({ ...p, description: e.target.value }))} rows={3}
            style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", resize: "vertical" }} />
        </div>
        {/* Harmonização personalizada */}
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>
            🍽️ Sugestões de Harmonização <span style={{ color: "#8b6060", fontSize: 8 }}>— separe por vírgula (ex: Carnes vermelhas, Queijos curados)</span>
          </label>
          <textarea value={obj.harmonization ?? ""} onChange={(e) => setObj((p) => ({ ...p, harmonization: e.target.value }))} rows={2}
            placeholder="Ex: 🥩 Carnes vermelhas, 🧀 Queijos curados, 🍄 Cogumelos"
            style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", resize: "vertical" }} />
          <div style={{ fontSize: 9, color: "#3a2a2a", marginTop: 3 }}>Se vazio, usa as sugestões padrão da categoria ({obj.category}).</div>
        </div>
        {/* Palavras-chave SEO */}
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>
            🔍 Palavras-chave (SEO) <span style={{ color: "#8b6060", fontSize: 8 }}>— ajudam o produto a aparecer no Google</span>
          </label>
          <input type="text" value={obj.keywords ?? ""} onChange={(e) => setObj((p) => ({ ...p, keywords: e.target.value }))}
            placeholder="Ex: vinho tinto francês, bordeaux, presente para sommelier"
            style={{ width: "100%", background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
          <div style={{ fontSize: 9, color: "#3a2a2a", marginTop: 3 }}>Separe por vírgula. Essas palavras ficam invisíveis na página mas são lidas pelo Google.</div>
        </div>
        {/* Imagem */}
        <div style={{ gridColumn: "1/-1" }}>
          <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 8 }}>Imagem do Produto <span style={{ color: "#3a2a2a", fontSize: 8 }}>(recomendado 1024×1024)</span></label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ width: 90, height: 90, borderRadius: 8, border: "1px solid #2a1f1f", overflow: "hidden", flexShrink: 0 }}>
              {obj.img ? <img src={obj.img} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <BottlePlaceholder size={60} />}
            </div>
            <div>
              <button type="button" onClick={() => imgRef.current?.click()} style={{ background: "#1a1410", border: "1px solid #3a2f2f", color: "#e8b4b4", padding: "8px 16px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif", display: "flex", alignItems: "center", gap: 7 }}>
                📷 Enviar Foto
              </button>
              {obj.img && <button type="button" onClick={() => setObj((p) => ({ ...p, img: null }))} style={{ marginTop: 5, background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif", display: "block" }}>Remover imagem</button>}
              <div style={{ fontSize: 9, color: "#3a2a2a", marginTop: 4 }}>JPG, PNG ou WebP · Exibido em 1024×1024</div>
            </div>
            <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => setObj((p) => ({ ...p, img: ev.target.result })); r.readAsDataURL(f); } e.target.value = ""; }} />
          </div>
        </div>
      </div>
    );
  };
  const handleLogin = () => {
    const rateLimitMsg = checkRateLimit();
    if (rateLimitMsg) { setLoginError(rateLimitMsg); return; }
    const stored = getAdmHash();
    if (hashStr(loginUser) === stored.user && hashStr(loginPass) === stored.pass) {
      setIsLoggedIn(true);
      setLoginError("");
      loginAttempts.count = 0;
      setLoginUser(""); setLoginPass("");
    } else {
      registerFailedAttempt();
      const remaining = 5 - loginAttempts.count;
      setLoginError(`Usuário ou senha incorretos.${remaining <= 2 && remaining > 0 ? ` ${remaining} tentativa(s) restante(s).` : ""}`);
    }
  };
  const addToCart = (wine) => {
    setCart((prev) => { const ex = prev.find((i) => i.id === wine.id); if (ex) return prev.map((i) => i.id === wine.id ? { ...i, qty: i.qty + 1 } : i); return [...prev, { ...wine, qty: 1 }]; });
    showToast(`${wine.name} adicionado ao carrinho!`);
  };
  const removeFromCart = (id) => setCart((prev) => prev.filter((i) => i.id !== id));
  const cartTotal = cart.reduce((s, i) => s + (i.promoPrice || i.price) * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const discountAmt = appliedCoupon ? Math.round(cartTotal * (couponPct(appliedCoupon) / 100)) : 0;
  const cartFinal = cartTotal - discountAmt;
  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!COUPONS[code]) { showToast("Cupom inválido ou expirado.", "error"); return; }
    if (!couponValid(code)) { showToast(`Cupom ${code} atingiu o limite de usos.`, "error"); return; }
    setAppliedCoupon(code);
    showToast(`Cupom ${code} aplicado! ${couponPct(code)}% de desconto 🎉`);
  };
  const handleAddWine = async () => {
    if (!newWine.name || !newWine.price) return showToast("Preencha nome e preço de venda.", "error");
    const base = { ...newWine, price: +newWine.price, costPrice: +newWine.costPrice || 0, promoPrice: newWine.promoPrice ? +newWine.promoPrice : null, stock: +newWine.stock || 0, year: +newWine.year || "", sales: 0, rating: 4.5 };
    const saved = await dbAddWine(base);
    if (saved) {
      setWines((p) => [...p, saved]);
      showToast("Vinho cadastrado e salvo no banco! ✅");
    } else {
      showToast("Erro ao salvar no banco. Verifique a conexão Supabase.", "error");
      return;
    }
    setNewWine(emptyWine); setAdminTab("wines");
    // Recarrega do banco para garantir sincronização
    if (supaCfg) setTimeout(() => loadFromSupabase(supaCfg), 800);
  };
  const handleSaveEdit = async () => {
    const updated = { ...editWine, price: +editWine.price, costPrice: +editWine.costPrice || 0, promoPrice: editWine.promoPrice ? +editWine.promoPrice : null, stock: +editWine.stock, year: +editWine.year };
    showToast("Salvando…");
    await dbUpdateWine(updated);
    setWines((p) => p.map((w) => w.id === updated.id ? updated : w));
    if (selectedWine?.id === updated.id) setSelectedWine(updated);
    setEditWine(null);
    showToast("Vinho atualizado! ✅");
    // Recarrega do banco para confirmar que foi salvo
    if (supaCfg) setTimeout(() => loadFromSupabase(supaCfg), 1000);
  };
  const handleDeleteWine = async (id) => { await dbDeleteWine(id); setWines((p) => p.filter((w) => w.id !== id)); showToast("Vinho removido.", "error"); };

  // 🎉 Welcome popup — show once after 1.5s
  useEffect(() => {
    if (!welcomeDismissed) {
      const t = setTimeout(() => setShowWelcomePopup(true), 1500);
      return () => clearTimeout(t);
    }
  }, [welcomeDismissed]);

  // ❤️ Wishlist toggle
  const toggleWishlist = (e, wineId) => {
    e.stopPropagation();
    setWishlist(prev => prev.includes(wineId) ? prev.filter(id => id !== wineId) : [...prev, wineId]);
    showToast(wishlist.includes(wineId) ? "Removido dos favoritos" : "❤️ Adicionado aos favoritos!");
  };

  // 🛒 Update cart qty
  const updateCartQty = (id, delta) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));
  };

  // 📊 Export CSV (ADM)
  const exportCSV = () => {
    const headers = ["id","name","origin","region","year","costPrice","price","promoPrice","stock","category","alcohol","grapes","description","rating","sales"];
    const rows = wines.map(w => headers.map(h => `"${(w[h] ?? "").toString().replace(/"/g,'""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "vinhos9-produtos.csv"; a.click();
    URL.revokeObjectURL(url);
    setExportMsg("CSV exportado com sucesso!");
    setTimeout(() => setExportMsg(""), 3000);
  };

  // 📥 Import CSV (ADM)
  const importCSV = async (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const lines = e.target.result.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim());
        const parsed = lines.slice(1).map((line, idx) => {
          const vals = line.match(/(".*?"|[^,]+)/g) || [];
          const obj = {};
          headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g,"").trim(); });
          // Aceita nomes alternativos de campos
          const description = obj.description || obj.desc || obj.descricao || obj.about || "";
          const harmonization = obj.harmonization || obj.harmonização || obj.foodPairing || obj.food_pairing || obj.harmonizacao || obj.pairing || "";
          const keywords = obj.keywords || obj.palavrasChave || obj.tags || obj.seo || "";
          const costPrice = +(obj.costPrice || obj.cost_price || obj.custo || 0);
          const promoPrice = obj.promoPrice || obj.promo_price || obj.promocao || "";
          return {
            ...obj,
            price: +obj.price || +obj.preco || 0,
            costPrice,
            promoPrice: promoPrice && +promoPrice > 0 ? +promoPrice : null,
            stock: +obj.stock || +obj.estoque || 0,
            year: +obj.year || +obj.ano || "",
            rating: +obj.rating || +obj.nota || 4.5,
            sales: +obj.sales || +obj.vendas || 0,
            img: null,
            category: obj.category || obj.categoria || "Tinto",
            description,
            keywords,
            harmonization,
          };
        }).filter(w => w.name && w.price > 0);

        if (parsed.length === 0) { showToast("Nenhum vinho válido encontrado no CSV.", "error"); return; }

        showToast(`Importando ${parsed.length} vinhos para o banco…`);
        const saved = [];
        for (const wine of parsed) {
          const result = await dbAddWine(wine);
          if (result) saved.push(result);
        }
        setWines(prev => [...prev, ...saved]);
        showToast(`✅ ${saved.length} de ${parsed.length} vinhos importados e salvos no banco!`);
      } catch (err) {
        console.error(err);
        showToast("Erro ao ler o CSV. Verifique o formato.", "error");
      }
    };
    reader.readAsText(file);
  };

  const totalRevenue = SALES_DATA.reduce((s, d) => s + d.revenue, 0);
  const totalCost = SALES_DATA.reduce((s, d) => s + d.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = ((totalProfit / totalRevenue) * 100).toFixed(1);
  const maxRevenue = Math.max(...SALES_DATA.map((d) => d.revenue));

  const filteredWines = (() => {
    const base = wines.filter((w) => {
      const activePrice = w.promoPrice || w.price;
      return (filter === "Todos" || w.category === filter)
        && (countryFilter === "Todos" || (w.origin || "").toLowerCase() === countryFilter.toLowerCase())
        && (w.name.toLowerCase().includes(search.toLowerCase()) || (w.origin || "").toLowerCase().includes(search.toLowerCase()))
        && activePrice >= priceRange[0] && activePrice <= priceRange[1];
    });
    if (sortBy === "price_asc") return [...base].sort((a,b) => (a.promoPrice||a.price)-(b.promoPrice||b.price));
    if (sortBy === "price_desc") return [...base].sort((a,b) => (b.promoPrice||b.price)-(a.promoPrice||a.price));
    if (sortBy === "rating") return [...base].sort((a,b) => b.rating-a.rating);
    if (sortBy === "name") return [...base].sort((a,b) => a.name.localeCompare(b.name));
    return base;
  })();
  const promoWines = wines.filter((w) => w.promoPrice && w.promoPrice < w.price);

  // Skeleton loading on filter/search change
  useEffect(() => {
    setCatalogLoading(true);
    const t = setTimeout(() => setCatalogLoading(false), 380);
    return () => clearTimeout(t);
  }, [filter, countryFilter, search, sortBy, priceRange[0], priceRange[1]]);

  // SEO: update title and keywords meta when product is selected
  useEffect(() => {
    if (selectedWine) {
      document.title = `${selectedWine.name} ${selectedWine.year ? '(' + selectedWine.year + ')' : ''} — Vinhos9`;
      let meta = document.querySelector('meta[name="keywords"]');
      if (!meta) { meta = document.createElement('meta'); meta.name = "keywords"; document.head.appendChild(meta); }
      const kw = [selectedWine.name, selectedWine.origin, selectedWine.region, selectedWine.category, selectedWine.grapes, selectedWine.keywords].filter(Boolean).join(', ');
      meta.content = kw;
      let desc = document.querySelector('meta[name="description"]');
      if (!desc) { desc = document.createElement('meta'); desc.name = "description"; document.head.appendChild(desc); }
      desc.content = selectedWine.description || `${selectedWine.name} — ${selectedWine.category} de ${selectedWine.origin}. Disponível na Vinhos9.`;
    } else {
      document.title = "Vinhos9 — Vinhos Importados de Excelência";
    }
  }, [selectedWine]);
  const relatedWines = selectedWine ? (() => {
    const sameCategory = wines.filter((w) => w.category === selectedWine.category && w.id !== selectedWine.id);
    if (sameCategory.length >= 3) return sameCategory;
    // Pad with other wines sorted by rating to reach up to 6
    const others = wines.filter((w) => w.category !== selectedWine.category && w.id !== selectedWine.id)
      .sort((a, b) => b.rating - a.rating);
    return [...sameCategory, ...others].slice(0, 6);
  })() : [];



  return (
    <div style={{ fontFamily: "'Georgia','Times New Roman',serif", minHeight: "100vh", background: "#0c0a09", color: "#f5f0e8" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#1a1410}::-webkit-scrollbar-thumb{background:#8b2c2c;border-radius:3px}
        @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
        .wine-card{transition:all .3s ease;cursor:pointer}
        .wine-card:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(139,44,44,.35)!important}
        .btn-red{background:#8b2c2c;border:none;color:#fff;cursor:pointer;font-family:Georgia,serif;transition:background .2s}
        .btn-red:hover{background:#a83232!important}
        .btn-ghost{background:transparent;border:1px solid #2a1f1f;color:#7a6a6a;cursor:pointer;font-family:Georgia,serif;transition:all .2s}
        .btn-ghost:hover{border-color:#5a4a4a!important;color:#a09080!important}
        .nav-link{cursor:pointer;font-size:13px;letter-spacing:2px;text-transform:uppercase;transition:color .2s}
        .nav-link:hover{color:#e8b4b4!important}
        .adm-tab:hover{background:rgba(139,44,44,.3)!important}
        input,select,textarea{outline:none}
        input:focus,select:focus,textarea:focus{border-color:#8b2c2c!important}
        .scroll-row{display:flex;gap:14px;overflow-x:auto;padding-bottom:8px}
        .scroll-row::-webkit-scrollbar{height:4px}
        .scroll-row::-webkit-scrollbar-thumb{background:#2a1f1f;border-radius:2px}
        @media(max-width:768px){
          .desktop-nav{display:none!important}
          .mobile-nav{display:flex!important}
          .hero-title{font-size:28px!important}
          .hero-sec{height:280px!important}
          .catalog-grid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr))!important;gap:12px!important}
          .cat-pad{padding:18px 14px 0!important}
          .filters-row{flex-direction:column!important;gap:10px!important}
          .cat-btns{flex-wrap:wrap!important;gap:6px!important}
          .adm-layout{flex-direction:column!important}
          .adm-sidebar{width:100%!important;flex-direction:row!important;display:flex!important;overflow-x:auto!important;padding:0!important;border-right:none!important;border-bottom:1px solid #2a1f1f!important;position:static!important;align-items:center!important}
          .adm-sidebar>div:first-child{display:none!important}
          .adm-sidebar>div.adm-tabs-wrap{display:contents!important;flex:1!important}
          .adm-sidebar>div.adm-sair-wrap{flex-shrink:0!important;padding:4px 8px!important;border-left:1px solid #2a1f1f!important}
          .adm-sidebar button{white-space:nowrap!important;border-left:none!important;border-bottom:3px solid transparent!important;padding:10px 12px!important}
          .adm-content{padding:16px 12px!important}
          .kpi-grid{grid-template-columns:repeat(2,1fr)!important}
          .form-grid{grid-template-columns:1fr!important}
          .tbl{font-size:11px!important}
          .tbl td,.tbl th{padding:7px 8px!important}
          .detail-flex{flex-direction:column!important}
          .detail-img{width:100%!important;flexShrink:unset!important}
          .cart-panel{width:100%!important}
          .promo-banner{flex-direction:column!important;gap:12px!important}
        }
      `}</style>

      {toast && <div style={{ position: "fixed", top: 20, right: 16, zIndex: 9999, background: toast.type === "error" ? "#7f1d1d" : "#1a3a1a", border: `1px solid ${toast.type === "error" ? "#ef4444" : "#4ade80"}`, color: "#fff", padding: "11px 18px", borderRadius: 8, animation: "toastIn .3s ease", fontSize: 13, maxWidth: 300 }}>{toast.msg}</div>}

      {/* Header */}
      <header style={{ background: "rgba(12,10,9,.97)", borderBottom: "1px solid #2a1f1f", height: 62, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(10px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22 }}>🍷</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: "bold", letterSpacing: 2, color: "#e8b4b4" }}>VINHOS9</div>
            <div style={{ fontSize: 8, letterSpacing: 3, color: "#8b6060", textTransform: "uppercase" }}>Importados Selecionados</div>
          </div>
        </div>
        {/* Desktop nav */}
        <nav className="desktop-nav" style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <span className="nav-link" onClick={() => { setPage("store"); setSelectedWine(null); }} style={{ color: page === "store" ? "#e8b4b4" : "#a09090" }}>Loja</span>
          <span className="nav-link" onClick={() => { setPage("about"); setSelectedWine(null); }} style={{ color: page === "about" ? "#e8b4b4" : "#a09090" }}>Sobre</span>
          <span className="nav-link" onClick={() => setClientPanelOpen(true)} style={{ color: "#a09090", display: "flex", alignItems: "center", gap: 4 }}>👤 Conta</span>
          <span className="nav-link" onClick={() => setPage("admin")} style={{ color: page === "admin" ? "#e8b4b4" : "#a09090" }}>ADM</span>
          {page === "store" && (
            <button className="btn-red" onClick={() => setCartOpen(true)} style={{ padding: "7px 14px", borderRadius: 4, fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
              🛒 {cartCount > 0 && <span style={{ background: "#e8b4b4", color: "#1a0a0a", borderRadius: "50%", width: 17, height: 17, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: "bold" }}>{cartCount}</span>}
            </button>
          )}
        </nav>
        {/* Mobile: cart + hamburger */}
        <div className="mobile-nav" style={{ display: "none", alignItems: "center", gap: 10 }}>
          {page === "store" && (
            <button className="btn-red" onClick={() => setCartOpen(true)} style={{ padding: "7px 12px", borderRadius: 4, fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              🛒 {cartCount > 0 && <span style={{ background: "#e8b4b4", color: "#1a0a0a", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: "bold" }}>{cartCount}</span>}
            </button>
          )}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ background: "none", border: "1px solid #2a1f1f", borderRadius: 6, color: "#e8b4b4", cursor: "pointer", padding: "6px 10px", fontSize: 16, fontFamily: "Georgia,serif" }}>
            {mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>
      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div style={{ position: "sticky", top: 62, zIndex: 99, background: "#140e0e", borderBottom: "1px solid #2a1f1f", padding: "8px 0", animation: "fadeIn .2s ease" }}>
          {[["store","🏠 Loja"],["about","🌍 Sobre"],["admin","🔐 ADM"]].map(([p, label]) => (
            <div key={p} onClick={() => { setPage(p); setSelectedWine(null); setMobileMenuOpen(false); }}
              style={{ padding: "13px 22px", cursor: "pointer", color: page === p ? "#e8b4b4" : "#a09080", fontSize: 13, letterSpacing: 1, borderLeft: page === p ? "3px solid #8b2c2c" : "3px solid transparent" }}>
              {label}
            </div>
          ))}
          <div onClick={() => { setClientPanelOpen(true); setMobileMenuOpen(false); }}
            style={{ padding: "13px 22px", cursor: "pointer", color: "#a09080", fontSize: 13, letterSpacing: 1, borderLeft: "3px solid transparent" }}>
            👤 Minha Conta
          </div>
        </div>
      )}

      {/* ── INFO SLIDER — sempre logo abaixo do cabeçalho ── */}
      <InfoSlider />

      {/* ── LOJA ── */}
      {page === "store" && !selectedWine && (
        <main style={{ animation: "fadeIn .4s ease" }}>

          {/* Hero */}
          {(() => {
            const isMobile = window.innerWidth < 768;
            const heroBg = (isMobile && heroBanner.imgMobile) ? heroBanner.imgMobile : heroBanner.imgDesktop;
            const heroStyle = heroBg
              ? { position: "relative", height: 390, backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }
              : { position: "relative", height: 390, background: "linear-gradient(135deg,#1a0505 0%,#2d0f0f 40%,#1a0a05 100%)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" };
            return (
              <div className="hero-sec" style={heroStyle}>
                <div style={{ position: "absolute", inset: 0, background: heroBg ? "rgba(0,0,0,0.5)" : "radial-gradient(ellipse at 60% 50%,rgba(139,44,44,.25) 0%,transparent 70%)" }} />
                {!heroBg && <div style={{ position: "absolute", top: 20, right: 60, fontSize: 130, opacity: .06, transform: "rotate(15deg)" }}>🍷</div>}
                <div style={{ textAlign: "center", position: "relative", zIndex: 2, padding: "0 20px" }}>
                  <p style={{ fontSize: 10, letterSpacing: 6, color: "#8b6060", textTransform: "uppercase", marginBottom: 12 }}>{heroBanner.tag}</p>
                  <h1 className="hero-title" style={{ fontSize: 48, fontWeight: "bold", color: "#f5f0e8", lineHeight: 1.1, marginBottom: 12, textShadow: "0 2px 40px rgba(139,44,44,.5)" }}>{heroBanner.title}<br /><span style={{ color: "#e8b4b4" }}>{heroBanner.titleAccent}</span></h1>
                  <p style={{ color: "#a09080", fontSize: 14, maxWidth: 420, margin: "0 auto 24px", lineHeight: 1.7 }}>{heroBanner.subtitle}</p>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                    <button className="btn-red" onClick={() => document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" })} style={{ padding: "11px 28px", borderRadius: 4, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{heroBanner.ctaLabel}</button>
                    {promoWines.length > 0 && <button onClick={() => document.getElementById("promocoes")?.scrollIntoView({ behavior: "smooth" })} style={{ padding: "11px 28px", borderRadius: 4, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", background: "transparent", border: "1px solid #b45309", color: "#fbbf24", cursor: "pointer", fontFamily: "Georgia,serif" }}>🏷 Ver Promoções</button>}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Banners Dinâmicos */}
          {banners.filter(b => b.active).length > 0 && (
            <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 36px 0" }}>
              <HeroBannerCarousel banners={banners} onFilterChange={(f) => setFilter(f)} setPage={setPage} />
            </div>
          )}

          {/* Banner promoções */}
          {promoWines.length > 0 && (
            <div id="promocoes" style={{ background: "linear-gradient(135deg,#1a1000,#2a1a00)", borderTop: "1px solid #3a2a00", borderBottom: "1px solid #3a2a00", padding: "32px 36px" }}>
              <div style={{ maxWidth: 1200, margin: "0 auto" }}>
                <div className="promo-banner" style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 22 }}>
                  <div>
                    <div style={{ fontSize: 9, letterSpacing: 4, color: "#b45309", textTransform: "uppercase", marginBottom: 4 }}>Ofertas Especiais</div>
                    <h2 style={{ fontSize: 22, color: "#fbbf24", letterSpacing: 1 }}>🏷 Em Promoção</h2>
                  </div>
                  <div style={{ flex: 1, height: 1, background: "linear-gradient(to right,#3a2a00,transparent)" }} />
                  <span style={{ fontSize: 11, color: "#b45309", letterSpacing: 1 }}>{promoWines.length} ofertas ativas</span>
                </div>
                <div className="scroll-row">
                  {promoWines.map((wine) => (
                    <div key={wine.id} onClick={() => setSelectedWine(wine)} style={{ cursor: "pointer", background: "linear-gradient(145deg,#1e1500,#150e00)", border: "1px solid #3a2a00", borderRadius: 12, overflow: "hidden", flexShrink: 0, width: 200, transition: "all .25s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 12px 36px rgba(180,83,9,.25)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
                      <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
                        <WineThumb wine={wine} height="100%" />
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(to bottom,transparent 50%,rgba(21,14,0,.85))" }} />
                        <div style={{ position: "absolute", top: 10, left: 10, background: "#b45309", color: "#fef3c7", fontSize: 11, padding: "3px 9px", borderRadius: 4, fontWeight: "bold", letterSpacing: 1 }}>-{discountPct(wine.price, wine.promoPrice)}%</div>
                      </div>
                      <div style={{ padding: "12px 14px" }}>
                        <div style={{ fontSize: 12, color: "#f5f0e8", fontWeight: "bold", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wine.name}</div>
                        <div style={{ fontSize: 10, color: "#7a6a6a", marginBottom: 8 }}>{wine.origin}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10 }}>
                          <span style={{ fontSize: 16, color: "#fbbf24", fontWeight: "bold" }}>{fmt(wine.promoPrice)}</span>
                          <span style={{ fontSize: 11, color: "#5a4a4a", textDecoration: "line-through" }}>{fmt(wine.price)}</span>
                        </div>
                        <button className="btn-red" onClick={(e) => { e.stopPropagation(); addToCart(wine); }} style={{ width: "100%", padding: "7px", borderRadius: 4, fontSize: 10, letterSpacing: 1 }}>+ Carrinho</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Catálogo */}
          <div id="catalog" className="cat-pad" style={{ padding: "32px 36px 0", maxWidth: 1200, margin: "0 auto" }}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 4 }}>Nosso Catálogo</div>
              <h2 style={{ fontSize: 20, color: "#f5f0e8" }}>Todos os Vinhos</h2>
            </div>
            <div className="filters-row" style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 22 }}>
              {/* Autocomplete Search */}
              <div style={{ flex: 1, minWidth: 190, position: "relative" }}>
                <input value={search} onChange={(e) => { setSearch(e.target.value); setShowAutocomplete(e.target.value.length > 0); }}
                  onFocus={() => search.length > 0 && setShowAutocomplete(true)}
                  onBlur={() => setTimeout(() => setShowAutocomplete(false), 180)}
                  placeholder="Buscar vinho ou origem..."
                  style={{ width: "100%", background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 13px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                {showAutocomplete && search.length > 0 && (() => {
                  const suggestions = wines.filter(w =>
                    w.name.toLowerCase().includes(search.toLowerCase()) ||
                    w.origin.toLowerCase().includes(search.toLowerCase())
                  ).slice(0, 6);
                  return suggestions.length > 0 ? (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 6, marginTop: 4, boxShadow: "0 12px 40px rgba(0,0,0,.6)", overflow: "hidden" }}>
                      {suggestions.map(w => (
                        <div key={w.id} onClick={() => { setSearch(w.name); setShowAutocomplete(false); }}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", cursor: "pointer", borderBottom: "1px solid #140e0e" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#2a1f1f"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div style={{ width: 32, height: 32, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}><WineThumb wine={w} height={32} /></div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, color: "#f5f0e8" }}>{w.name}</div>
                            <div style={{ fontSize: 10, color: "#5a4a4a" }}>{w.origin} · {w.category} · {fmt(w.promoPrice||w.price)}</div>
                          </div>
                          {w.promoPrice && <span style={{ fontSize: 9, background: "#b45309", color: "#fef3c7", padding: "1px 6px", borderRadius: 3 }}>-{discountPct(w.price, w.promoPrice)}%</span>}
                        </div>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
              {/* Filtro de preço */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowPriceFilter(!showPriceFilter)}
                  style={{ padding: "9px 14px", background: (priceRange[0] > 0 || priceRange[1] < 3000) ? "#8b2c2c" : "#1a1410", border: `1px solid ${(priceRange[0] > 0 || priceRange[1] < 3000) ? "#8b2c2c" : "#2a1f1f"}`, borderRadius: 4, color: "#f5f0e8", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", whiteSpace: "nowrap" }}>
                  💰 Preço {(priceRange[0] > 0 || priceRange[1] < 3000) ? `· ${fmt(priceRange[0])}–${fmt(priceRange[1])}` : "▾"}
                </button>
                {showPriceFilter && (
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 50, background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 10, padding: "18px 18px 14px", minWidth: 240, boxShadow: "0 12px 40px rgba(0,0,0,.5)", animation: "fadeIn .2s ease" }}>
                    <div style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 12 }}>Faixa de Preço</div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#e8b4b4" }}>{fmt(priceRange[0])}</span>
                      <span style={{ fontSize: 12, color: "#e8b4b4" }}>{fmt(priceRange[1])}</span>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: "#5a4a4a", marginBottom: 4 }}>Mínimo</div>
                      <input type="range" min={0} max={3000} step={50} value={priceRange[0]}
                        onChange={(e) => setPriceRange([Math.min(+e.target.value, priceRange[1] - 50), priceRange[1]])}
                        style={{ width: "100%", accentColor: "#8b2c2c" }} />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 9, color: "#5a4a4a", marginBottom: 4 }}>Máximo</div>
                      <input type="range" min={0} max={3000} step={50} value={priceRange[1]}
                        onChange={(e) => setPriceRange([priceRange[0], Math.max(+e.target.value, priceRange[0] + 50)])}
                        style={{ width: "100%", accentColor: "#8b2c2c" }} />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setPriceRange([0, 3000]); setShowPriceFilter(false); }}
                        style={{ flex: 1, padding: "7px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#7a6a6a", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>Limpar</button>
                      <button onClick={() => setShowPriceFilter(false)}
                        style={{ flex: 1, padding: "7px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>Aplicar</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="cat-btns" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {CATEGORIES.map((c) => <button key={c} onClick={() => setFilter(c)} style={{ padding: "6px 13px", borderRadius: 4, border: `1px solid ${filter === c ? "#8b2c2c" : "#2a1f1f"}`, background: filter === c ? "#8b2c2c" : "transparent", color: filter === c ? "#fff" : "#a09080", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "Georgia,serif", transition: "all .2s" }}>{c}</button>)}
              </div>
              {/* Filtro por País — dinâmico baseado nos vinhos cadastrados */}
              {(() => {
                const countries = ["Todos", ...Array.from(new Set(wines.map(w => w.origin).filter(Boolean).map(o => o.trim()))).sort()];
                if (countries.length <= 2) return null; // só mostra se tiver mais de 1 país
                return (
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 4 }}>
                    <span style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", alignSelf: "center", paddingRight: 4 }}>País</span>
                    {countries.map(c => {
                      const flag = { "Argentina": "🇦🇷", "Brasil": "🇧🇷", "Chile": "🇨🇱", "Portugal": "🇵🇹", "França": "🇫🇷", "France": "🇫🇷", "Italy": "🇮🇹", "Itália": "🇮🇹", "Spain": "🇪🇸", "Espanha": "🇪🇸", "África do Sul": "🇿🇦", "South Africa": "🇿🇦", "EUA": "🇺🇸", "USA": "🇺🇸", "Uruguai": "🇺🇾", "Austrália": "🇦🇺", "Alemanha": "🇩🇪" }[c] || (c === "Todos" ? "🌍" : "🍷");
                      const active = countryFilter === c;
                      return (
                        <button key={c} onClick={() => setCountryFilter(c)}
                          style={{ padding: "5px 12px", borderRadius: 4, border: `1px solid ${active ? "#6b4c9a" : "#2a1f1f"}`, background: active ? "#6b4c9a" : "transparent", color: active ? "#fff" : "#a09080", cursor: "pointer", fontSize: 11, letterSpacing: 1, fontFamily: "Georgia,serif", transition: "all .2s" }}>
                          {flag} {c}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              {/* Ordenação */}
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ padding: "7px 12px", background: sortBy !== "default" ? "#8b2c2c" : "#1a1410", border: `1px solid ${sortBy !== "default" ? "#8b2c2c" : "#2a1f1f"}`, borderRadius: 4, color: "#f5f0e8", fontSize: 11, fontFamily: "Georgia,serif", cursor: "pointer" }}>
                <option value="default">Ordenar ▾</option>
                <option value="price_asc">💰 Menor preço</option>
                <option value="price_desc">💎 Maior preço</option>
                <option value="rating">⭐ Melhor avaliação</option>
                <option value="name">🔤 A–Z</option>
              </select>
            </div>
            <div className="catalog-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 18, paddingBottom: 60 }}>
              {catalogLoading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
                : filteredWines.map((wine, i) => {
                const activePrice = wine.promoPrice || wine.price;
                const isWishlisted = wishlist.includes(wine.id);
                return (
                  <div key={wine.id} className="wine-card" onClick={() => setSelectedWine(wine)} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 12, overflow: "hidden", animation: `fadeIn .4s ease ${i * .05}s both`, position: "relative" }}>
                    {/* Imagem quadrada 1:1 */}
                    <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
                      <WineThumb wine={wine} height="100%" />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,transparent 55%,rgba(12,10,9,.8))" }} />
                      {wine.promoPrice && <span style={{ position: "absolute", top: 10, left: 10, background: "#b45309", color: "#fef3c7", fontSize: 9, padding: "2px 8px", borderRadius: 3, fontWeight: "bold", letterSpacing: 1 }}>-{discountPct(wine.price, wine.promoPrice)}%</span>}
                      <span style={{ position: "absolute", top: 10, right: 10, background: "#8b2c2c", color: "#fff", fontSize: 9, padding: "2px 7px", borderRadius: 3 }}>{wine.category}</span>
                      {/* ❤️ Wishlist button */}
                      <button onClick={(e) => toggleWishlist(e, wine.id)}
                        style={{ position: "absolute", bottom: 10, right: 10, background: isWishlisted ? "rgba(139,44,44,.9)" : "rgba(20,14,14,.7)", border: `1px solid ${isWishlisted ? "#8b2c2c" : "rgba(255,255,255,.1)"}`, borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", color: isWishlisted ? "#fff" : "#a09080" }}>
                        {isWishlisted ? "❤️" : "🤍"}
                      </button>
                      <div style={{ position: "absolute", bottom: 10, left: 12 }}>
                        <div style={{ fontSize: 9, color: "rgba(245,240,232,.6)" }}>{wine.origin} · {wine.year}</div>
                      </div>
                    </div>
                    <div style={{ padding: "14px 14px 16px" }}>
                      <h3 style={{ fontSize: 14, color: "#f5f0e8", marginBottom: 4 }}>{wine.name}</h3>
                      <div style={{ marginBottom: 6 }}><Stars rating={wine.rating} /></div>
                      <p style={{ fontSize: 11, color: "#7a6a6a", lineHeight: 1.5, marginBottom: 8, minHeight: 34 }}>{wine.description?.slice(0, 70)}…</p>
                      {/* Low stock badge */}
                      {wine.stock <= 3 && <div style={{ marginBottom: 8 }}><LowStockBadge stock={wine.stock} /></div>}
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 17, color: wine.promoPrice ? "#fbbf24" : "#e8b4b4", fontWeight: "bold" }}>{fmt(activePrice)}</span>
                        {wine.promoPrice && <span style={{ fontSize: 10, color: "#5a4a4a", textDecoration: "line-through" }}>{fmt(wine.price)}</span>}
                      </div>
                      <div style={{ fontSize: 9, color: "#5a4a4a", marginBottom: 12 }}>{wine.stock > 0 ? `${wine.stock} em estoque` : ""}</div>
                      <button className="btn-red" onClick={(e) => { e.stopPropagation(); addToCart(wine); }} disabled={wine.stock === 0}
                        style={{ width: "100%", padding: "10px", borderRadius: 4, fontSize: 11, letterSpacing: 1, background: wine.stock === 0 ? "#2a1f1f" : "#8b2c2c", color: wine.stock === 0 ? "#5a4a4a" : "#fff", cursor: wine.stock === 0 ? "not-allowed" : "pointer" }}>
                        {wine.stock === 0 ? "Esgotado" : "🛒 Adicionar ao Carrinho"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      )}

      {/* ── DETALHE DO VINHO ── */}
      {page === "store" && selectedWine && (
        <div style={{ animation: "slideUp .4s ease" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 20px" }}>
            {/* Breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, fontSize: 11, color: "#5a4a4a" }}>
              <span onClick={() => setSelectedWine(null)} style={{ cursor: "pointer", color: "#8b6060" }}>Loja</span>
              <span>›</span>
              <span onClick={() => { setSelectedWine(null); setFilter(selectedWine.category); }} style={{ cursor: "pointer", color: "#8b6060" }}>{selectedWine.category}</span>
              <span>›</span>
              <span style={{ color: "#a09080" }}>{selectedWine.name}</span>
            </div>
            <button onClick={() => setSelectedWine(null)} style={{ background: "none", border: "none", color: "#8b6060", cursor: "pointer", fontSize: 12, letterSpacing: 1, marginBottom: 26, display: "flex", alignItems: "center", gap: 6, fontFamily: "Georgia,serif" }}>← Voltar ao catálogo</button>
            <div className="detail-flex" style={{ display: "flex", gap: 44, alignItems: "flex-start" }}>
              {/* Imagem — grande no desktop, full width no mobile */}
              <div className="detail-img" style={{ width: 480, flexShrink: 0, aspectRatio: "1/1", borderRadius: 14, overflow: "hidden", border: "1px solid #2a1f1f", position: "relative", cursor: "zoom-in" }} onClick={() => setZoomWine(selectedWine)}>
                <WineThumb wine={selectedWine} height="100%" />
                {selectedWine.promoPrice && (
                  <div style={{ position: "absolute", top: 14, left: 14, background: "#b45309", color: "#fef3c7", fontSize: 13, padding: "5px 12px", borderRadius: 6, fontWeight: "bold", letterSpacing: 1 }}>
                    -{discountPct(selectedWine.price, selectedWine.promoPrice)}% OFF
                  </div>
                )}
                <span style={{ position: "absolute", top: 14, right: 14, background: "#8b2c2c", color: "#fff", fontSize: 9, padding: "3px 9px", borderRadius: 3, letterSpacing: 1 }}>{selectedWine.category}</span>
                <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,.5)", borderRadius: 4, padding: "3px 7px", fontSize: 9, color: "#a09080" }}>🔍 Clique para ampliar</div>
              </div>
              {/* Info */}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, letterSpacing: 3, color: "#8b6060", textTransform: "uppercase", marginBottom: 6 }}>{selectedWine.origin} · {selectedWine.region}</p>
                <h1 style={{ fontSize: 28, color: "#f5f0e8", marginBottom: 8, lineHeight: 1.2 }}>{selectedWine.name}</h1>
                <div style={{ marginBottom: 14 }}><Stars rating={selectedWine.rating} /></div>
                <p style={{ fontSize: 13, color: "#a09080", lineHeight: 1.8, marginBottom: 20 }}>{selectedWine.description}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
                  {[["🗓 Safra", selectedWine.year], ["🍇 Uvas", selectedWine.grapes], ["🌍 Região", selectedWine.region], ["🍾 Teor Alcoólico", selectedWine.alcohol]].map(([label, val]) => (
                    <div key={label} style={{ background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 8, padding: "10px 13px" }}>
                      <div style={{ fontSize: 9, color: "#5a4a4a", letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 12, color: "#f5f0e8" }}>{val || "—"}</div>
                    </div>
                  ))}
                </div>
                {/* Preço */}
                <div style={{ background: selectedWine.promoPrice ? "linear-gradient(135deg,#1e1500,#150e00)" : "#1a1410", border: `1px solid ${selectedWine.promoPrice ? "#3a2a00" : "#2a1f1f"}`, borderRadius: 10, padding: "16px 18px", marginBottom: 18 }}>
                  {selectedWine.promoPrice ? (
                    <div>
                      <div style={{ fontSize: 10, color: "#b45309", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>🏷 Preço Promocional</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
                        <span style={{ fontSize: 30, color: "#fbbf24", fontWeight: "bold" }}>{fmt(selectedWine.promoPrice)}</span>
                        <span style={{ fontSize: 16, color: "#5a4a4a", textDecoration: "line-through" }}>{fmt(selectedWine.price)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#b45309" }}>Você economiza {fmt(selectedWine.price - selectedWine.promoPrice)} ({discountPct(selectedWine.price, selectedWine.promoPrice)}% de desconto)</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 28, color: "#e8b4b4", fontWeight: "bold" }}>{fmt(selectedWine.price)}</div>
                      <div style={{ fontSize: 9, color: "#5a4a4a", marginTop: 3 }}>{selectedWine.stock} unidades em estoque</div>
                    </div>
                  )}
                </div>
                {/* Low stock */}
                {selectedWine.stock <= 3 && <div style={{ marginBottom: 14 }}><LowStockBadge stock={selectedWine.stock} /></div>}
                {/* Botões ação */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
                  <button className="btn-red" onClick={() => addToCart(selectedWine)} disabled={selectedWine.stock === 0} style={{ padding: "13px 28px", borderRadius: 4, fontSize: 12, letterSpacing: 2, textTransform: "uppercase", background: selectedWine.stock === 0 ? "#2a1f1f" : "#8b2c2c", color: selectedWine.stock === 0 ? "#5a4a4a" : "#fff", cursor: selectedWine.stock === 0 ? "not-allowed" : "pointer" }}>
                    {selectedWine.stock === 0 ? "Esgotado" : "🛒 Adicionar ao Carrinho"}
                  </button>
                  {/* WhatsApp */}
                  <a
                    href={`https://wa.me/5511999998888?text=${encodeURIComponent(`Olá! Tenho interesse no *${selectedWine.name}* (${selectedWine.year}) por ${fmt(selectedWine.promoPrice || selectedWine.price)}. Poderia me ajudar?`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 22px", borderRadius: 4, background: "#15803d", color: "#fff", textDecoration: "none", fontSize: 12, letterSpacing: 1, fontFamily: "Georgia,serif", fontWeight: "bold", transition: "background .2s" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#166534"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#15803d"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Falar no WhatsApp
                  </a>
                </div>

                {/* Calculadora de Frete */}
                <FreteCalculator wine={selectedWine} />

                {/* Harmonização */}
                <div style={{ background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 10, padding: "18px 20px", marginTop: 14 }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: "#8b6060", textTransform: "uppercase", marginBottom: 10 }}>🍽 Harmonização</div>
                  <p style={{ fontSize: 11, color: "#5a4a4a", marginBottom: 12 }}>Este {selectedWine.category.toLowerCase()} combina com:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(selectedWine.harmonization
                      ? selectedWine.harmonization.split(",").map(s => s.trim()).filter(Boolean)
                      : (HARMONIZATION[selectedWine.category] || [])
                    ).map(item => (
                      <span key={item} style={{ background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 20, padding: "5px 12px", fontSize: 12, color: "#e8b4b4" }}>{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Avaliações */}
            <ReviewSection wine={selectedWine} reviews={reviews} setReviews={setReviews} reviewedWines={reviewedWines} setReviewedWines={setReviewedWines} onSubmitReview={dbInsertReview} />

            {/* Carrossel — mesma categoria */}
            {relatedWines.length > 0 && (
              <Carousel
                items={relatedWines}
                title={`Outros ${selectedWine.category}s`}
                subtitle="Você também pode gostar"
                accentColor="#e8b4b4"
                autoPlay={true}
                visibleDesktop={4}
                onSelect={(wine) => { setSelectedWine(wine); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              />
            )}

            {/* Carrossel — em promoção */}
            {promoWines.filter((w) => w.id !== selectedWine.id).length > 0 && (
              <div style={{ marginTop: 0, paddingTop: 0 }}>
                <Carousel
                  items={promoWines.filter((w) => w.id !== selectedWine.id)}
                  title="🏷 Em Promoção"
                  subtitle="Não perca"
                  accentColor="#fbbf24"
                  autoPlay={true}
                  visibleDesktop={4}
                  onSelect={(wine) => { setSelectedWine(wine); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CARRINHO ── */}
      {cartOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200 }}>
          <div onClick={() => setCartOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.72)", backdropFilter: "blur(4px)" }} />
          <div className="cart-panel" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 370, background: "#140e0e", borderLeft: "1px solid #2a1f1f", animation: "slideIn .3s ease", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #2a1f1f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ fontSize: 15, letterSpacing: 2 }}>Carrinho ({cartCount})</h2>
              <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", color: "#a09080", cursor: "pointer", fontSize: 17 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: "center", color: "#5a4a4a", marginTop: 60 }}>
                  <div style={{ width: 60, height: 60, margin: "0 auto 12px", borderRadius: 8, overflow: "hidden" }}><BottlePlaceholder size={60} /></div>
                  <p style={{ fontSize: 12 }}>Carrinho vazio</p>
                </div>
              ) : cart.map((item) => {
                const ap = item.promoPrice || item.price;
                return (
                  <div key={item.id} style={{ display: "flex", gap: 10, marginBottom: 11, padding: 11, background: "#1a1410", borderRadius: 8, border: "1px solid #2a1f1f" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}><WineThumb wine={item} height={44} /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", marginBottom: 2 }}>{item.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <button onClick={() => updateCartQty(item.id, -1)} style={{ width: 22, height: 22, background: "#2a1f1f", border: "none", borderRadius: 3, color: "#e8b4b4", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                        <span style={{ fontSize: 12, color: "#f5f0e8", minWidth: 18, textAlign: "center" }}>{item.qty}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} style={{ width: 22, height: 22, background: "#2a1f1f", border: "none", borderRadius: 3, color: "#e8b4b4", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        <span style={{ fontSize: 10, color: item.promoPrice ? "#fbbf24" : "#8b6060", marginLeft: 4 }}>{fmt(item.promoPrice || item.price)} × {item.qty}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "#e8b4b4", fontWeight: "bold", fontSize: 12 }}>{fmt((item.promoPrice || item.price) * item.qty)}</div>
                      <button onClick={() => removeFromCart(item.id)} style={{ background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>remover</button>
                    </div>
                  </div>
                );
              })}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: 18, borderTop: "1px solid #2a1f1f" }}>
                {/* Cupom */}
                {!appliedCoupon ? (
                  <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
                    <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                      placeholder="Cupom de desconto"
                      style={{ flex: 1, background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "8px 11px", color: "#f5f0e8", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1 }} />
                    <button onClick={handleApplyCoupon}
                      style={{ padding: "8px 12px", background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 4, color: "#e8b4b4", cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>
                      🎁 Aplicar
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, padding: "8px 12px", background: "rgba(74,222,128,.07)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 6 }}>
                    <span style={{ fontSize: 11, color: "#4ade80" }}>🎁 {appliedCoupon} · -{couponPct(appliedCoupon)}%</span>
                    <button onClick={() => { setAppliedCoupon(null); setCouponInput(""); }} style={{ background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>remover</button>
                  </div>
                )}
                {/* Totais */}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: appliedCoupon ? 6 : 14 }}>
                  <span style={{ color: "#a09080", fontSize: 12 }}>Subtotal</span>
                  <span style={{ fontSize: 13, color: "#a09080" }}>{fmt(cartTotal)}</span>
                </div>
                {appliedCoupon && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                    <span style={{ color: "#4ade80", fontSize: 12 }}>Desconto ({couponPct(appliedCoupon)}%)</span>
                    <span style={{ fontSize: 13, color: "#4ade80" }}>-{fmt(discountAmt)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, paddingTop: 10, borderTop: "1px solid #2a1f1f" }}>
                  <span style={{ color: "#f5f0e8", fontSize: 14 }}>Total</span>
                  <span style={{ fontSize: 20, color: "#e8b4b4", fontWeight: "bold" }}>{fmt(cartFinal)}</span>
                </div>
                <button className="btn-red" onClick={() => { setCartOpen(false); setCheckoutStep(1); setCheckoutOpen(true); }} style={{ width: "100%", padding: "12px", borderRadius: 4, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Finalizar Pedido →</button>
                <div style={{ fontSize: 9, color: "#3a2a2a", textAlign: "center", marginTop: 8 }}>Cupons: VINO10 · VINO20 · BEMVINDO</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SOBRE ── */}
      {page === "about" && (
        <main style={{ animation: "fadeIn .4s ease", maxWidth: 860, margin: "0 auto", padding: "52px 24px 80px" }}>
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ fontSize: 10, letterSpacing: 5, color: "#8b6060", textTransform: "uppercase", marginBottom: 10 }}>Nossa História</div>
            <h1 style={{ fontSize: 36, color: "#e8b4b4", marginBottom: 16, lineHeight: 1.2 }}>Uma paixão pelo vinho<br />que virou missão</h1>
            <p style={{ color: "#a09080", fontSize: 15, lineHeight: 1.9, maxWidth: 560, margin: "0 auto" }}>
              A Vinhos9 nasceu em 2018 da obsessão de dois sommeliers brasileiros por vinhos que contam histórias — garrafas que carregam a alma de seus terroirs e a dedicação de quem as faz.
            </p>
          </div>

          {/* Linha do tempo */}
          <div style={{ marginBottom: 60 }}>
            <div style={{ fontSize: 9, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 24, textAlign: "center" }}>Nossa Trajetória</div>
            {[
              { year: "2018", title: "O começo", desc: "Fundada em São Paulo com apenas 12 rótulos cuidadosamente selecionados em viagens pela Europa e América do Sul." },
              { year: "2020", title: "Expansão do portfólio", desc: "Chegamos a 80 rótulos e firmamos parcerias diretas com vinícolas na França, Itália, Argentina e Chile." },
              { year: "2022", title: "Reconhecimento", desc: "Premiados como 'Melhor Importadora Boutique' pela Revista Adega. Mais de 2.000 clientes satisfeitos." },
              { year: "2024", title: "Loja online", desc: "Lançamos nossa plataforma digital para levar vinhos excepcionais a todo o Brasil, com entrega temperada." },
              { year: "2026", title: "Hoje", desc: "Mais de 120 rótulos exclusivos, curadoria mensal e um clube de assinatura com 500 membros ativos." },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 24, marginBottom: 28, alignItems: "flex-start" }}>
                <div style={{ minWidth: 60, textAlign: "right" }}>
                  <span style={{ fontSize: 13, color: "#8b2c2c", fontWeight: "bold" }}>{item.year}</span>
                </div>
                <div style={{ width: 1, background: "#2a1f1f", alignSelf: "stretch", position: "relative", flexShrink: 0 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#8b2c2c", position: "absolute", top: 4, left: -4 }} />
                </div>
                <div style={{ paddingBottom: 4 }}>
                  <div style={{ fontSize: 14, color: "#f5f0e8", fontWeight: "bold", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: "#7a6a6a", lineHeight: 1.7 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Valores */}
          <div style={{ marginBottom: 60 }}>
            <div style={{ fontSize: 9, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 24, textAlign: "center" }}>Por que a Vinhos9</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 18 }}>
              {[
                { icon: "🍇", title: "Curadoria Rigorosa", desc: "Cada rótulo é provado e aprovado pelos nossos sommeliers antes de entrar no catálogo." },
                { icon: "🌡", title: "Entrega Climatizada", desc: "Embalagem especial que mantém a temperatura ideal do vinho durante todo o transporte." },
                { icon: "🤝", title: "Parcerias Diretas", desc: "Compramos diretamente das vinícolas, garantindo autenticidade e melhor preço." },
                { icon: "📚", title: "Conhecimento", desc: "Cada vinho acompanha ficha técnica detalhada com sugestões de harmonização." },
              ].map((v) => (
                <div key={v.title} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 12, padding: "22px 20px" }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{v.icon}</div>
                  <div style={{ fontSize: 14, color: "#e8b4b4", fontWeight: "bold", marginBottom: 8 }}>{v.title}</div>
                  <div style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.7 }}>{v.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div style={{ textAlign: "center", padding: "40px 24px", background: "linear-gradient(135deg,#1a0505,#2d0f0f)", borderRadius: 16, border: "1px solid #3a1f1f" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🍷</div>
            <h2 style={{ fontSize: 22, color: "#e8b4b4", marginBottom: 10 }}>Explore nosso catálogo</h2>
            <p style={{ color: "#7a6a6a", fontSize: 13, marginBottom: 22, lineHeight: 1.7 }}>Encontre o vinho perfeito para cada momento especial.</p>
            <button className="btn-red" onClick={() => { setPage("store"); setSelectedWine(null); }} style={{ padding: "12px 32px", borderRadius: 4, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>
              Ver Catálogo Completo
            </button>
          </div>
        </main>
      )}

      {/* ── CHECKOUT ── */}
      {checkoutOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={() => { if (checkoutStep !== 3) setCheckoutOpen(false); }} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.82)", backdropFilter: "blur(5px)" }} />
          <div style={{ position: "relative", background: "#140e0e", border: "1px solid #2a1f1f", borderRadius: 16, padding: "28px 28px 24px", width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", animation: "slideUp .3s ease" }}>

            {/* Passo 1 — Dados do cliente */}
            {checkoutStep === 1 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h2 style={{ fontSize: 17, color: "#e8b4b4", letterSpacing: 1 }}>🧾 Finalizar Pedido</h2>
                  <button onClick={() => setCheckoutOpen(false)} style={{ background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 18 }}>✕</button>
                </div>
                <p style={{ fontSize: 10, color: "#5a4a4a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 22 }}>Passo 1 de 2 · Seus Dados</p>

                {/* Progresso */}
                <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
                  {[1,2].map((s) => <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= checkoutStep ? "#8b2c2c" : "#2a1f1f", transition: "background .3s" }} />)}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13 }}>
                  {/* Nome */}
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Nome Completo <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.nome} onChange={(e) => setCheckoutData(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Maria da Silva"
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  {/* CPF */}
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>CPF <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.cpf} onChange={(e) => {
                      const d = e.target.value.replace(/\D/g,"").slice(0,11);
                      const fmt = d.length > 9 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/,"$1.$2.$3-$4")
                        : d.length > 6 ? d.replace(/(\d{3})(\d{3})(\d{1,3})/,"$1.$2.$3")
                        : d.length > 3 ? d.replace(/(\d{3})(\d{1,3})/,"$1.$2") : d;
                      setCheckoutData(p => ({ ...p, cpf: fmt }));
                    }} placeholder="000.000.000-00" maxLength={14}
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  {/* Contato */}
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>WhatsApp / Telefone <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.contato} onChange={(e) => {
                      const d = e.target.value.replace(/\D/g,"").slice(0,11);
                      const fmt = d.length > 6 ? d.replace(/(\d{2})(\d{5})(\d{1,4})/,"($1) $2-$3")
                        : d.length > 2 ? d.replace(/(\d{2})(\d+)/,"($1) $2") : d;
                      setCheckoutData(p => ({ ...p, contato: fmt }));
                    }} placeholder="(11) 99999-9999" maxLength={15}
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>

                  {/* Divisor endereço */}
                  <div style={{ gridColumn: "1/-1", borderTop: "1px solid #2a1f1f", paddingTop: 16, marginTop: 4 }}>
                    <div style={{ fontSize: 9, letterSpacing: 3, color: "#8b6060", textTransform: "uppercase", marginBottom: 14 }}>📦 Endereço de Entrega</div>
                  </div>

                  {/* CEP */}
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>CEP <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.cep} onChange={(e) => {
                      const d = e.target.value.replace(/\D/g,"").slice(0,8);
                      setCheckoutData(p => ({ ...p, cep: d.length > 5 ? d.slice(0,5)+"-"+d.slice(5) : d }));
                    }} placeholder="00000-000" maxLength={9}
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  {/* UF */}
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Estado (UF)</label>
                    <input value={checkoutData.uf} onChange={(e) => setCheckoutData(p => ({ ...p, uf: e.target.value.toUpperCase().slice(0,2) }))} placeholder="SP" maxLength={2}
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  {/* Rua */}
                  <div style={{ gridColumn: "1/-1" }}>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Rua / Avenida <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.rua} onChange={(e) => setCheckoutData(p => ({ ...p, rua: e.target.value }))} placeholder="Rua das Videiras"
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  {/* Número + Complemento */}
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Número <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.numero} onChange={(e) => setCheckoutData(p => ({ ...p, numero: e.target.value }))} placeholder="123"
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Complemento</label>
                    <input value={checkoutData.complemento} onChange={(e) => setCheckoutData(p => ({ ...p, complemento: e.target.value }))} placeholder="Apto 42"
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  {/* Bairro + Cidade */}
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Bairro</label>
                    <input value={checkoutData.bairro} onChange={(e) => setCheckoutData(p => ({ ...p, bairro: e.target.value }))} placeholder="Jardim Europa"
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>Cidade <span style={{ color: "#8b2c2c" }}>*</span></label>
                    <input value={checkoutData.cidade} onChange={(e) => setCheckoutData(p => ({ ...p, cidade: e.target.value }))} placeholder="São Paulo"
                      style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                  </div>
                </div>

                <button onClick={() => {
                  if (!checkoutData.nome || !checkoutData.cpf || !checkoutData.contato || !checkoutData.rua || !checkoutData.numero || !checkoutData.cidade)
                    return showToast("Preencha todos os campos obrigatórios (*).", "error");
                  if (!validarCPF(checkoutData.cpf))
                    return showToast("CPF inválido. Verifique o número informado.", "error");
                  setCheckoutStep(2);
                }} style={{ width: "100%", marginTop: 20, padding: "13px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 2, textTransform: "uppercase" }}>
                  Revisar Pedido →
                </button>
              </>
            )}

            {/* Passo 2 — Confirmação */}
            {checkoutStep === 2 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <h2 style={{ fontSize: 17, color: "#e8b4b4", letterSpacing: 1 }}>✅ Confirmar Pedido</h2>
                  <button onClick={() => setCheckoutOpen(false)} style={{ background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 18 }}>✕</button>
                </div>
                <p style={{ fontSize: 10, color: "#5a4a4a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 22 }}>Passo 2 de 2 · Revisão</p>
                <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
                  {[1,2].map((s) => <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: "#8b2c2c" }} />)}
                </div>

                {/* Itens */}
                <div style={{ background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 10 }}>Itens do Pedido</div>
                  {cart.map((item) => (
                    <div key={item.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, fontSize: 12 }}>
                      <span style={{ color: "#a09080" }}>{item.name} × {item.qty}</span>
                      <span style={{ color: "#e8b4b4" }}>{fmt((item.promoPrice || item.price) * item.qty)}</span>
                    </div>
                  ))}
                  {appliedCoupon && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#4ade80", paddingTop: 8, borderTop: "1px solid #2a1f1f", marginTop: 8 }}>
                      <span>Cupom {appliedCoupon}</span><span>-{fmt(discountAmt)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: "bold", paddingTop: 10, borderTop: "1px solid #2a1f1f", marginTop: 8 }}>
                    <span style={{ color: "#f5f0e8" }}>Total</span><span style={{ color: "#e8b4b4" }}>{fmt(cartFinal)}</span>
                  </div>
                </div>

                {/* Dados cliente */}
                <div style={{ background: "#120e0c", border: "1px solid #2a1f1f", borderRadius: 10, padding: "14px 16px", marginBottom: 20, fontSize: 12 }}>
                  <div style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 10 }}>Dados de Entrega</div>
                  {[["Nome", checkoutData.nome], ["CPF", checkoutData.cpf], ["Contato", checkoutData.contato],
                    ["Endereço", `${checkoutData.rua}, ${checkoutData.numero}${checkoutData.complemento ? " — "+checkoutData.complemento : ""}`],
                    ["Bairro / Cidade", `${checkoutData.bairro ? checkoutData.bairro+" · " : ""}${checkoutData.cidade} ${checkoutData.uf ? "— "+checkoutData.uf : ""}`],
                    ["CEP", checkoutData.cep]
                  ].map(([l, v]) => v && (
                    <div key={l} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
                      <span style={{ color: "#5a4a4a", minWidth: 70 }}>{l}:</span>
                      <span style={{ color: "#f5f0e8" }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setCheckoutStep(1)} style={{ flex: 1, padding: "12px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#a09080", cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>← Editar</button>
                  <button onClick={async () => {
                    setCheckoutStep(3);
                    const loggedClient = (() => { try { return JSON.parse(localStorage.getItem("v9_client") || "null"); } catch { return null; } })();
                    const order = {
                      customer: checkoutData.nome,
                      cpf: checkoutData.cpf,
                      contact: checkoutData.contato,
                      email: loggedClient?.email || (checkoutData.contato.includes("@") ? checkoutData.contato : null),
                      address: `${checkoutData.rua}, ${checkoutData.numero}${checkoutData.complemento ? " — "+checkoutData.complemento : ""}, ${checkoutData.bairro}, ${checkoutData.cidade} ${checkoutData.uf} — CEP ${checkoutData.cep}`,
                      items: cart.map(i => `${i.name} × ${i.qty}`).join(", "),
                      total: cartFinal,
                      coupon: appliedCoupon || null,
                      status: "Aguardando",
                      date: new Date().toLocaleDateString("pt-BR"),
                    };
                    await dbInsertOrder(order);
                    setOrders(prev => [{ ...order, id: `#${Date.now()}` }, ...prev]);
                    // Incrementa uso do cupom se aplicado
                    if (appliedCoupon && COUPONS[appliedCoupon]) {
                      const c = COUPONS[appliedCoupon];
                      const updated = { ...customCoupons, [appliedCoupon]: { ...(typeof c === "object" ? c : { pct: c, limit: null }), uses: ((typeof c === "object" ? c.uses : 0) || 0) + 1 } };
                      saveCoupons(updated);
                    }
                    // Adiciona pontos ao cliente logado (R$1 = 1 ponto)
                    try {
                      const savedClient = JSON.parse(localStorage.getItem("v9_client") || "null");
                      if (savedClient) {
                        const pts = Math.floor(cartFinal);
                        const orderId = `#${Date.now()}`;
                        const updatedClient = {
                          ...savedClient,
                          points: (savedClient.points || 0) + pts,
                          tier: (savedClient.points || 0) + pts >= 5000 ? "Gold" : (savedClient.points || 0) + pts >= 2000 ? "Silver" : "Bronze",
                          orders: [{ id: orderId, date: new Date().toLocaleDateString("pt-BR"), items: cart.map(i => `${i.name} × ${i.qty}`).join(", "), total: cartFinal, status: "Aguardando", pts }, ...(savedClient.orders || [])],
                          pointsHistory: [{ date: new Date().toLocaleDateString("pt-BR"), desc: `Compra ${orderId}`, pts }, ...(savedClient.pointsHistory || [])],
                        };
                        localStorage.setItem("v9_client", JSON.stringify(updatedClient));
                        try { const db = JSON.parse(localStorage.getItem("v9_clients_db") || "{}"); db[updatedClient.id] = updatedClient; localStorage.setItem("v9_clients_db", JSON.stringify(db)); } catch {}
                        showToast(`+${pts} pontos adicionados à sua conta! 🪙`);
                        // E-mail pedido confirmado
                        sendEmail("pedidoConfirmado", {
                          to_email: savedClient.email, to_name: savedClient.name,
                          store_name: "Vinhos9", order_id: orderId,
                          order_items: cart.map(i => `${i.name} × ${i.qty}`).join(", "),
                          order_total: cartFinal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                          order_date: new Date().toLocaleDateString("pt-BR"),
                          points_earned: pts, points_total: updatedClient.points,
                        });
                      }
                    } catch {}
                    setTimeout(() => { setCart([]); setAppliedCoupon(null); setCouponInput(""); setCheckoutData(emptyCheckout); }, 2200);
                    setTimeout(() => { setCheckoutOpen(false); setCheckoutStep(1); showToast("Pedido confirmado! Entraremos em contato. 🎉"); }, 4000);
                  }} style={{ flex: 2, padding: "12px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 2, textTransform: "uppercase" }}>
                    🍷 Confirmar Pedido
                  </button>
                </div>
              </>
            )}

            {/* Passo 3 — Sucesso */}
            {checkoutStep === 3 && (
              <div style={{ textAlign: "center", padding: "32px 12px" }}>
                <div style={{ fontSize: 52, marginBottom: 16, animation: "fadeIn .5s ease" }}>🍾</div>
                <h2 style={{ fontSize: 22, color: "#4ade80", marginBottom: 10 }}>Pedido Confirmado!</h2>
                <p style={{ fontSize: 13, color: "#a09080", lineHeight: 1.8, marginBottom: 8 }}>
                  Obrigado, <strong style={{ color: "#f5f0e8" }}>{checkoutData.nome.split(" ")[0]}</strong>!<br />
                  Entraremos em contato pelo número <strong style={{ color: "#e8b4b4" }}>{checkoutData.contato}</strong> em breve.
                </p>
                <p style={{ fontSize: 11, color: "#5a4a4a" }}>Esta janela fechará automaticamente…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADM LOGIN ── */}
      {page === "admin" && !isLoggedIn && (
        <div style={{ minHeight: "calc(100vh - 62px)", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at center,#1a0a0a 0%,#0c0a09 70%)", animation: "fadeIn .4s ease" }}>
          <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 14, padding: "44px 36px", width: "100%", maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>🔐</div>
            <h2 style={{ fontSize: 18, letterSpacing: 2, color: "#e8b4b4", marginBottom: 4 }}>Área Restrita</h2>
            <p style={{ fontSize: 10, color: "#5a4a4a", letterSpacing: 1, marginBottom: 28 }}>PAINEL ADMINISTRATIVO</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5, textAlign: "left" }}>Usuário</label>
              <input value={loginUser} onChange={(e) => setLoginUser(e.target.value)} placeholder="admin" style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "11px 13px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5, textAlign: "left" }}>Senha</label>
              <div style={{ position: "relative" }}>
                <input type={showPass ? "text" : "password"} value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "11px 38px 11px 13px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif" }} />
                <button onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 13 }}>{showPass ? "🙈" : "👁"}</button>
              </div>
            </div>
            {loginError && <p style={{ color: "#ef4444", fontSize: 11, marginBottom: 10, textAlign: "left" }}>⚠ {loginError}</p>}
            <button className="btn-red" onClick={handleLogin} style={{ width: "100%", padding: "13px", borderRadius: 4, fontSize: 12, letterSpacing: 2, textTransform: "uppercase" }}>Entrar</button>
          </div>
        </div>
      )}

      {/* ── ADM PAINEL ── */}
      {page === "admin" && isLoggedIn && (
        <div className="adm-layout" style={{ display: "flex", minHeight: "calc(100vh - 62px)", animation: "fadeIn .4s ease" }}>
          <aside className="adm-sidebar" style={{ width: 200, background: "#100c0c", borderRight: "1px solid #2a1f1f", padding: "24px 0", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "0 18px 18px", borderBottom: "1px solid #1a1410" }}>
              <div style={{ fontSize: 8, letterSpacing: 3, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 3 }}>Painel</div>
              <div style={{ fontSize: 12, color: "#e8b4b4" }}>Administração</div>
            </div>
            <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", display: "flex", flexDirection: "column" }} className="adm-tabs-wrap">
            {[["dashboard","📊","Dashboard"],["wines","🍷","Vinhos"],["add","➕","Cadastrar"],["csv","📥","Importar CSV"],["banners","🎨","Banners"],["promos","🏷","Promoções"],["cupons","🎁","Cupons"],["frete","🚚","Frete"],["imagens","🖼","Galeria"],["orders","📦","Pedidos"],["reviews","⭐","Avaliações"],["emails","📧","E-mails"],["pagamento","💳","Pagamento"],["supabase","🗄️","Banco de Dados"],["seguranca","🔐","Segurança"]].map(([tab, icon, label]) => (
              <button key={tab} className="adm-tab" onClick={() => setAdminTab(tab)} style={{ width: "100%", padding: "12px 18px", display: "flex", alignItems: "center", gap: 9, background: adminTab === tab ? "rgba(139,44,44,.3)" : "transparent", border: "none", color: adminTab === tab ? "#e8b4b4" : "#7a6a6a", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", textAlign: "left", borderLeft: adminTab === tab ? "3px solid #8b2c2c" : "3px solid transparent", transition: "all .2s" }}>
                {icon} {label}
                {tab === "promos" && promoWines.length > 0 && <span style={{ background: "#b45309", color: "#fef3c7", fontSize: 9, padding: "1px 6px", borderRadius: 10, marginLeft: "auto" }}>{promoWines.length}</span>}
                {tab === "reviews" && reviews.filter(r => !r.approved).length > 0 && <span style={{ background: "#8b2c2c", color: "#fca5a5", fontSize: 9, padding: "1px 6px", borderRadius: 10, marginLeft: "auto" }}>{reviews.filter(r => !r.approved).length}</span>}
              </button>
            ))}
            </div>
            <div style={{ padding: "14px 18px", borderTop: "1px solid #1a1410", marginTop: "auto" }} className="adm-sair-wrap">
              <button className="btn-ghost" onClick={() => { setIsLoggedIn(false); setLoginUser(""); setLoginPass(""); }} style={{ width: "100%", padding: "9px", borderRadius: 4, fontSize: 10, letterSpacing: 1 }}>🚪 Sair</button>
            </div>
          </aside>

          <main className="adm-content" style={{ flex: 1, padding: 30, overflowY: "auto", fontSize: 15 }}>

            {/* Dashboard */}
            {adminTab === "dashboard" && (
              <div>
                <h1 style={{ fontSize: 21, marginBottom: 5 }}>Dashboard</h1>
                <p style={{ color: "#7a6a6a", fontSize: 12, marginBottom: 24 }}>Visão geral do negócio</p>
                <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 26 }}>
                  {[
                    { label: "Receita Total", value: fmt(totalRevenue), icon: "💰", delta: "+18%", col: "#4ade80" },
                    { label: "Lucro Total", value: fmt(totalProfit), icon: "📈", delta: `Margem ${avgMargin}%`, col: parseFloat(avgMargin) >= 30 ? "#4ade80" : "#fbbf24" },
                    { label: "Em Promoção", value: `${promoWines.length} vinhos`, icon: "🏷", delta: "ativos agora", col: "#fbbf24" },
                    { label: "Estoque", value: wines.reduce((s, w) => s + w.stock, 0) + " un.", icon: "📋", delta: wines.filter(w => w.stock <= 3).length + " baixo estoque", col: wines.filter(w => w.stock <= 3).length > 0 ? "#fb923c" : "#4ade80" },
                  ].map((kpi) => (
                    <div key={kpi.label} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 9 }}>
                        <span style={{ fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase" }}>{kpi.label}</span>
                        <span style={{ fontSize: 17 }}>{kpi.icon}</span>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: "bold", color: "#f5f0e8", marginBottom: 2 }}>{kpi.value}</div>
                      <div style={{ fontSize: 10, color: kpi.col }}>{kpi.delta}</div>
                    </div>
                  ))}
                </div>
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                    <h3 style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase" }}>Receita vs Lucro Mensal</h3>
                    <div style={{ display: "flex", gap: 14, fontSize: 10 }}><span style={{ color: "#8b2c2c" }}>■ Receita</span><span style={{ color: "#4ade80" }}>■ Lucro</span></div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130 }}>
                    {SALES_DATA.map((d) => { const lc = d.revenue - d.cost; return (
                      <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                        <div style={{ fontSize: 8, color: "#7a6a6a" }}>{Math.round(d.revenue / 1000)}k</div>
                        <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 100 }}>
                          <div style={{ flex: 1, background: "linear-gradient(to top,#8b2c2c,#b03a3a)", borderRadius: "3px 3px 0 0", height: `${(d.revenue / maxRevenue) * 100}px` }} />
                          <div style={{ flex: 1, background: "linear-gradient(to top,#166534,#4ade80)", borderRadius: "3px 3px 0 0", height: `${(lc / maxRevenue) * 100}px` }} />
                        </div>
                        <div style={{ fontSize: 9, color: "#a09080" }}>{d.month}</div>
                      </div>
                    ); })}
                  </div>
                </div>
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22 }}>
                  <h3 style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 14 }}>Top Vinhos — Margem</h3>
                  {[...wines].sort((a, b) => b.sales - a.sales).slice(0, 5).map((w, i) => {
                    const mg = margin(w.costPrice, w.price), lc = profit(w.costPrice, w.price);
                    return (
                      <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #1a1410" }}>
                        <span style={{ fontSize: 13, color: ["#ffd700","#c0c0c0","#cd7f32","#a09080","#7a6a6a"][i], width: 20 }}>#{i+1}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}><WineThumb wine={w} height={32} /></div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "#f5f0e8" }}>{w.name}</div><div style={{ fontSize: 9, color: "#5a4a4a" }}>{w.sales} vendas {w.promoPrice ? "· 🏷 promo" : ""}</div></div>
                        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                          <MarginBadge pct={mg} />
                          <div style={{ fontSize: 10, color: "#7a6a6a" }}>+{fmt(lc)}/un</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Vinhos mais visitados */}
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22 }}>
                  <h3 style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 14 }}>👁 Vinhos Mais Visitados</h3>
                  {Object.keys(wineVisits).length === 0 ? (
                    <p style={{ fontSize: 12, color: "#3a2a2a" }}>Nenhuma visita registrada ainda. As visitas são contadas quando clientes abrem a página de um produto.</p>
                  ) : (
                    [...wines]
                      .map(w => ({ ...w, visits: wineVisits[w.id] || 0 }))
                      .filter(w => w.visits > 0)
                      .sort((a, b) => b.visits - a.visits)
                      .slice(0, 5)
                      .map((w, i) => (
                        <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #1a1410" }}>
                          <span style={{ fontSize: 13, color: ["#ffd700","#c0c0c0","#cd7f32","#a09080","#7a6a6a"][i], width: 20 }}>#{i+1}</span>
                          <div style={{ width: 32, height: 32, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}><WineThumb wine={w} height={32} /></div>
                          <div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "#f5f0e8" }}>{w.name}</div><div style={{ fontSize: 9, color: "#5a4a4a" }}>{w.category} · {w.origin}</div></div>
                          <div style={{ background: "#1a2a3a", color: "#60a5fa", padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: "bold" }}>{w.visits} visitas</div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* Lista vinhos */}
            {adminTab === "wines" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
                  <div><h1 style={{ fontSize: 21, marginBottom: 3 }}>Gerenciar Vinhos</h1><p style={{ color: "#7a6a6a", fontSize: 11 }}>{wines.length} cadastrados</p></div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={exportCSV} style={{ padding: "8px 14px", borderRadius: 4, fontSize: 11, letterSpacing: 1, background: "#1a3a1a", border: "1px solid #4ade80", color: "#4ade80", cursor: "pointer", fontFamily: "Georgia,serif" }}>📊 Exportar CSV</button>
                    <button className="btn-red" onClick={() => setAdminTab("add")} style={{ padding: "8px 16px", borderRadius: 4, fontSize: 11, letterSpacing: 1 }}>+ Cadastrar</button>
                  </div>
                </div>
                {exportMsg && <div style={{ marginBottom: 14, padding: "8px 14px", background: "rgba(74,222,128,.08)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 6, fontSize: 11, color: "#4ade80" }}>✅ {exportMsg}</div>}
                {/* Low stock alert */}
                {wines.filter(w => w.stock <= 3 && w.stock > 0).length > 0 && (
                  <div style={{ marginBottom: 16, padding: "10px 16px", background: "rgba(251,146,60,.06)", border: "1px solid rgba(251,146,60,.3)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 12, color: "#fb923c" }}>
                      <strong>Estoque baixo:</strong> {wines.filter(w => w.stock <= 3 && w.stock > 0).map(w => `${w.name} (${w.stock} un.)`).join(" · ")}
                    </span>
                  </div>
                )}
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, overflow: "auto" }}>
                  <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#120e0c" }}>{["","Vinho","Custo","Venda","Promo","Margem","Estoque","Ações"].map((h) => <th key={h} style={{ padding: "11px 12px", textAlign: "left", fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", borderBottom: "1px solid #2a1f1f" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {wines.map((w, i) => { const mg = margin(w.costPrice, w.price); return (
                        <tr key={w.id} style={{ borderBottom: "1px solid #1a1410", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)" }}>
                          <td style={{ padding: "9px 12px" }}><div style={{ width: 36, height: 36, borderRadius: 6, overflow: "hidden" }}><WineThumb wine={w} height={36} /></div></td>
                          <td style={{ padding: "9px 12px", color: "#f5f0e8" }}>{w.name}</td>
                          <td style={{ padding: "9px 12px", color: "#a09080" }}>{fmt(w.costPrice||0)}</td>
                          <td style={{ padding: "9px 12px", color: "#e8b4b4" }}>{fmt(w.price)}</td>
                          <td style={{ padding: "9px 12px" }}>{w.promoPrice ? <span style={{ color: "#fbbf24", fontSize: 11 }}>{fmt(w.promoPrice)}</span> : <span style={{ color: "#3a2a2a", fontSize: 10 }}>—</span>}</td>
                          <td style={{ padding: "9px 12px" }}><MarginBadge pct={mg} /></td>
                          <td style={{ padding: "9px 12px" }}><span style={{ background: w.stock < 5 ? "#7f1d1d" : "#1a3a1a", color: w.stock < 5 ? "#fca5a5" : "#4ade80", padding: "2px 8px", borderRadius: 10, fontSize: 10 }}>{w.stock}</span></td>
                          <td style={{ padding: "9px 12px" }}>
                            <div style={{ display: "flex", gap: 5 }}>
                              <button onClick={() => setEditWine({ ...w })} style={{ background: "none", border: "1px solid #2a3a2a", color: "#4ade80", padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>Editar</button>
                              <button onClick={() => handleDeleteWine(w.id)} style={{ background: "none", border: "1px solid #3a1f1f", color: "#ef4444", padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>Remover</button>
                              <button onClick={() => { const base = window.location.href.split('?')[0]; window.open(`${base}?produto=${encodeURIComponent(w.id)}`, '_blank'); }} style={{ background: "none", border: "1px solid #2a2a3a", color: "#a0a0e8", padding: "3px 9px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>👁 Ver</button>
                            </div>
                          </td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cadastrar */}
            {adminTab === "add" && (
              <div style={{ maxWidth: 580 }}>
                <h1 style={{ fontSize: 21, marginBottom: 5 }}>Cadastrar Vinho</h1>
                <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 24 }}>Adicione um novo vinho ao catálogo</p>
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 24 }}>
                  {renderFormFields(newWine, setNewWine, newImgRef)}
                  <button className="btn-red" onClick={handleAddWine} style={{ marginTop: 18, padding: "12px 26px", borderRadius: 4, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Cadastrar Vinho</button>
                </div>
              </div>
            )}

            {/* 🆕 Banners ADM */}
            {adminTab === "banners" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
                  <div>
                    <h1 style={{ fontSize: 21, marginBottom: 3 }}>🎨 Banners da Loja</h1>
                    <p style={{ color: "#7a6a6a", fontSize: 11 }}>Edite o banner principal, carrossel de destaques e banners promocionais</p>
                  </div>
                </div>

                {/* Banner Principal (Hero) */}
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase" }}>Banner Principal da Home</div>
                    <span style={{ fontSize: 9, padding: "2px 9px", background: "#1a3a1a", color: "#4ade80", borderRadius: 10 }}>● Sempre ativo</span>
                  </div>

                  {/* Live preview */}
                  <div style={{ background: "linear-gradient(135deg,#1a0505,#2d0f0f,#1a0a05)", borderRadius: 8, padding: "20px 24px", textAlign: "center", marginBottom: 18, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 8, right: 20, fontSize: 60, opacity: .06 }}>🍷</div>
                    <div style={{ fontSize: 8, letterSpacing: 4, color: "#8b6060", textTransform: "uppercase", marginBottom: 6 }}>{heroBanner.tag}</div>
                    <div style={{ fontSize: 20, color: "#f5f0e8", fontWeight: "bold", lineHeight: 1.2, marginBottom: 4 }}>
                      {heroBanner.title}<br /><span style={{ color: "#e8b4b4" }}>{heroBanner.titleAccent}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#7a6a6a", marginBottom: 10 }}>{heroBanner.subtitle}</div>
                    <span style={{ background: "#8b2c2c", color: "#fff", fontSize: 9, padding: "5px 14px", borderRadius: 3, letterSpacing: 1, textTransform: "uppercase" }}>{heroBanner.ctaLabel}</span>
                  </div>

                  {/* Fields */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      ["tag", "Etiqueta acima do título", "Coleção Exclusiva", false],
                      ["ctaLabel", "Texto do botão CTA", "Explorar Catálogo", false],
                      ["title", "Linha 1 do título (branca)", "Vinhos Importados", true],
                      ["titleAccent", "Linha 2 do título (rosé)", "de Excelência", true],
                      ["subtitle", "Subtítulo", "Curadoria especial...", true],
                    ].map(([field, label, ph, full]) => (
                      <div key={field} style={full ? { gridColumn: "1/-1" } : {}}>
                        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>{label}</label>
                        <input
                          value={heroBanner[field]}
                          onChange={e => setHeroBanner(p => ({ ...p, [field]: e.target.value }))}
                          placeholder={ph}
                          style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "9px 11px", color: "#f5f0e8", fontSize: 13, fontFamily: "Georgia,serif", outline: "none" }}
                        />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setHeroBanner(INITIAL_HERO_BANNER)}
                    style={{ marginTop: 14, padding: "7px 16px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#5a4a4a", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>
                    ↺ Restaurar padrão
                  </button>

                  {/* Hero Background Images */}
                  <div style={{ marginTop: 20, borderTop: "1px solid #2a1f1f", paddingTop: 18 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "#8b6060", textTransform: "uppercase", marginBottom: 14 }}>🖼 Imagem de Fundo do Banner</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {/* Desktop */}
                      <div style={{ background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 8 }}>🖥 Desktop</div>
                        <div style={{ fontSize: 9, color: "#3a2a2a", marginBottom: 10 }}>Recomendado: <strong style={{ color: "#8b6060" }}>1920 × 600 px</strong> · JPG ou WebP</div>
                        {heroBanner.imgDesktop ? (
                          <div style={{ position: "relative", marginBottom: 8 }}>
                            <img src={heroBanner.imgDesktop} alt="bg desktop" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 5, border: "1px solid #3a2a2a" }} />
                            <button onClick={() => setHeroBanner(p => ({ ...p, imgDesktop: null }))} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.7)", border: "none", color: "#ef4444", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                          </div>
                        ) : <div style={{ width: "100%", height: 60, background: "#1a1410", borderRadius: 5, border: "1px dashed #2a1f1f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#3a2a2a", marginBottom: 8 }}>sem imagem — usa gradiente</div>}
                        <input type="file" accept="image/*" id="heroDesktopInput" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setHeroBanner(p => ({ ...p, imgDesktop: ev.target.result })); r.readAsDataURL(f); }} />
                        <button onClick={() => document.getElementById('heroDesktopInput').click()} style={{ width: "100%", padding: "7px", background: "#1a1410", border: "1px solid #3a2f2f", color: "#e8b4b4", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>📷 Enviar imagem desktop</button>
                      </div>
                      {/* Mobile */}
                      <div style={{ background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 8, padding: 14 }}>
                        <div style={{ fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 8 }}>📱 Mobile</div>
                        <div style={{ fontSize: 9, color: "#3a2a2a", marginBottom: 10 }}>Recomendado: <strong style={{ color: "#8b6060" }}>768 × 500 px</strong> · JPG ou WebP</div>
                        {heroBanner.imgMobile ? (
                          <div style={{ position: "relative", marginBottom: 8 }}>
                            <img src={heroBanner.imgMobile} alt="bg mobile" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 5, border: "1px solid #3a2a2a" }} />
                            <button onClick={() => setHeroBanner(p => ({ ...p, imgMobile: null }))} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,.7)", border: "none", color: "#ef4444", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                          </div>
                        ) : <div style={{ width: "100%", height: 60, background: "#1a1410", borderRadius: 5, border: "1px dashed #2a1f1f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#3a2a2a", marginBottom: 8 }}>usa a imagem desktop</div>}
                        <input type="file" accept="image/*" id="heroMobileInput" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setHeroBanner(p => ({ ...p, imgMobile: ev.target.result })); r.readAsDataURL(f); }} />
                        <button onClick={() => document.getElementById('heroMobileInput').click()} style={{ width: "100%", padding: "7px", background: "#1a1410", border: "1px solid #3a2f2f", color: "#e8b4b4", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>📷 Enviar imagem mobile</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 9, color: "#3a2a2a", marginTop: 10 }}>💡 Se não enviar imagem mobile, o site usa automaticamente a imagem desktop no celular.</div>
                  </div>
                </div>

                {/* Destaques */}
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22, marginBottom: 22 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 14 }}>Carrossel de Destaques</div>
                  <p style={{ fontSize: 11, color: "#5a4a4a", marginBottom: 16 }}>Selecione os vinhos a aparecer no carrossel de destaques da home:</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
                    {wines.map(w => {
                      const selected = highlightIds.includes(w.id);
                      return (
                        <div key={w.id} onClick={() => setHighlightIds(p => selected ? p.filter(id => id !== w.id) : [...p, w.id])}
                          style={{ background: selected ? "rgba(139,44,44,.15)" : "#1a1410", border: `1px solid ${selected ? "#8b2c2c" : "#2a1f1f"}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", transition: "all .2s" }}>
                          <div style={{ width: "100%", aspectRatio: "2/1", overflow: "hidden", position: "relative" }}>
                            <WineThumb wine={w} height="100%" />
                            {selected && <div style={{ position: "absolute", top: 4, right: 4, background: "#8b2c2c", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>✓</div>}
                          </div>
                          <div style={{ padding: "7px 9px" }}>
                            <div style={{ fontSize: 10, color: "#f5f0e8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</div>
                            <div style={{ fontSize: 9, color: "#5a4a4a" }}>{w.category}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 10, color: "#4ade80" }}>{highlightIds.length} vinhos em destaque selecionados</div>
                </div>

                {/* Banners promocionais */}
                <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 14 }}>Banners Promocionais</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {banners.map((banner) => (
                    <div key={banner.id} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: `1px solid ${banner.active ? "#3a2a1a" : "#2a1f1f"}`, borderRadius: 12, overflow: "hidden" }}>
                      {/* Preview */}
                      <div style={{ background: banner.bg, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 8, letterSpacing: 2, padding: "2px 8px", border: `1px solid ${banner.accent}50`, color: banner.accent, borderRadius: 2, textTransform: "uppercase" }}>{banner.tag}</span>
                          <div style={{ fontSize: 15, color: "#f5f0e8", fontWeight: "bold", marginTop: 6 }}>{banner.title}</div>
                          <div style={{ fontSize: 11, color: "#a09080", marginTop: 3 }}>{banner.subtitle}</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end", flexShrink: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ fontSize: 10, color: banner.active ? "#4ade80" : "#5a4a4a" }}>{banner.active ? "● Ativo" : "○ Inativo"}</span>
                            <button onClick={() => setBanners(p => p.map(b => b.id === banner.id ? {...b, active: !b.active} : b))}
                              style={{ padding: "5px 12px", background: banner.active ? "#7f1d1d" : "#1a3a1a", border: "none", borderRadius: 4, color: banner.active ? "#fca5a5" : "#4ade80", cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif" }}>
                              {banner.active ? "Desativar" : "Ativar"}
                            </button>
                          </div>
                        </div>
                      </div>
                      {/* Info */}
                      <div style={{ padding: "10px 16px", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 10, color: "#5a4a4a" }}>
                        <span>CTA: <strong style={{ color: "#a09080" }}>{banner.cta}</strong></span>
                        <span>Filtro: <strong style={{ color: "#a09080" }}>{banner.targetFilter || "Sem filtro"}</strong></span>
                        <span>Tema: <strong style={{ color: banner.accent }}>{banner.accent}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(139,44,44,.06)", border: "1px solid rgba(139,44,44,.2)", borderRadius: 8, fontSize: 11, color: "#8b6060" }}>
                  💡 Os banners ativos aparecem em rotação automática na home da loja. Use-os para promover categorias, campanhas sazonais ou novidades.
                </div>
              </div>
            )}

            {/* Promoções */}
            {adminTab === "promos" && (
              <div>
                <h1 style={{ fontSize: 21, marginBottom: 5 }}>🏷 Promoções Ativas</h1>
                <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 24 }}>{promoWines.length} vinhos em promoção</p>
                {promoWines.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "#5a4a4a" }}>
                    <div style={{ fontSize: 36, marginBottom: 12 }}>🏷</div>
                    <p style={{ fontSize: 13 }}>Nenhum vinho em promoção no momento.</p>
                    <p style={{ fontSize: 11, marginTop: 6 }}>Para criar uma promoção, edite um vinho e preencha o campo "Preço Promocional".</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
                    {promoWines.map((w) => {
                      const mg = margin(w.costPrice, w.promoPrice);
                      const lc = profit(w.costPrice, w.promoPrice);
                      return (
                        <div key={w.id} style={{ background: "linear-gradient(145deg,#1e1500,#150e00)", border: "1px solid #3a2a00", borderRadius: 12, overflow: "hidden" }}>
                          <div style={{ width: "100%", aspectRatio: "1/1", position: "relative", overflow: "hidden" }}>
                            <WineThumb wine={w} height="100%" />
                            <div style={{ position: "absolute", top: 10, left: 10, background: "#b45309", color: "#fef3c7", fontSize: 12, padding: "4px 10px", borderRadius: 4, fontWeight: "bold" }}>-{discountPct(w.price, w.promoPrice)}%</div>
                          </div>
                          <div style={{ padding: 16 }}>
                            <div style={{ fontSize: 14, color: "#f5f0e8", fontWeight: "bold", marginBottom: 10 }}>{w.name}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                              {[["Preço Normal", fmt(w.price), "#a09080"], ["Preço Promo", fmt(w.promoPrice), "#fbbf24"], ["Margem Promo", `${mg}%`, parseFloat(mg) >= 20 ? "#4ade80" : "#f87171"], ["Lucro/Garrafa", fmt(lc), "#4ade80"]].map(([l, v, c]) => (
                                <div key={l} style={{ background: "rgba(0,0,0,.3)", borderRadius: 6, padding: "8px 10px" }}>
                                  <div style={{ fontSize: 8, color: "#5a4a4a", letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
                                  <div style={{ fontSize: 13, color: c, fontWeight: "bold" }}>{v}</div>
                                </div>
                              ))}
                            </div>
                            <button onClick={() => setEditWine({ ...w })} style={{ width: "100%", padding: "8px", background: "none", border: "1px solid #3a2a00", color: "#fbbf24", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>Editar Promoção</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Pedidos */}
            {adminTab === "orders" && (
              <div>
                <h1 style={{ fontSize: 21, marginBottom: 5 }}>Pedidos</h1>
                <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 24 }}>{Array.isArray(orders) ? orders.length : 0} pedidos recentes</p>
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, overflow: "auto" }}>
                  <table className="tbl" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#120e0c" }}>{["Pedido","Cliente","Itens","Total","Data","Status"].map((h) => <th key={h} style={{ padding: "11px 12px", textAlign: "left", fontSize: 8, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", borderBottom: "1px solid #2a1f1f" }}>{h}</th>)}</tr></thead>
                    <tbody>
                      {(Array.isArray(orders) ? orders : []).map((o, i) => (
                        <tr key={o.id} style={{ borderBottom: "1px solid #1a1410", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,.01)" }}>
                          <td style={{ padding: "9px 12px", color: "#e8b4b4" }}>{o.id}</td>
                          <td style={{ padding: "9px 12px", color: "#f5f0e8" }}>{o.customer}</td>
                          <td style={{ padding: "9px 12px", color: "#a09080", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.items || o.wine}</td>
                          <td style={{ padding: "9px 12px", color: "#e8b4b4" }}>{fmt(o.total)}</td>
                          <td style={{ padding: "9px 12px", color: "#7a6a6a" }}>{o.date}</td>
                          <td style={{ padding: "9px 12px" }}>
                            <select value={o.status} onChange={async (e) => {
                              const novoStatus = e.target.value;
                              const atualizado = { ...o, status: novoStatus };
                              setOrders(prev => prev.map(x => x.id === o.id ? atualizado : x));
                              // Atualiza no Supabase se tiver id numérico
                              if (o.id && !String(o.id).startsWith("#")) {
                                await supaFetch(`/rest/v1/orders?id=eq.${o.id}`, "PATCH", { status: novoStatus });
                              }
                              // Dispara e-mail ao cliente se tiver e-mail no pedido
                              const clientEmail = o.contact || o.email;
                              if (clientEmail && clientEmail.includes("@")) {
                                if (novoStatus === "Em trânsito") {
                                  sendEmail("pedidoTransito", { to_email: clientEmail, to_name: o.customer, store_name: "Vinhos9", order_id: o.id, order_date: o.date });
                                  showToast(`📧 E-mail "Em trânsito" enviado para ${clientEmail}`);
                                } else if (novoStatus === "Entregue") {
                                  sendEmail("pedidoEntregue", { to_email: clientEmail, to_name: o.customer, store_name: "Vinhos9", order_id: o.id, order_total: fmt(o.total), points_earned: Math.floor(o.total) });
                                  showToast(`📧 E-mail "Entregue" enviado para ${clientEmail}`);
                                }
                              } else {
                                showToast(`Status atualizado para "${novoStatus}"`);
                              }
                            }}
                              style={{ background: o.status === "Entregue" ? "#1a3a1a" : o.status === "Em trânsito" ? "#1a2a3a" : "#2a2a1a", color: o.status === "Entregue" ? "#4ade80" : o.status === "Em trânsito" ? "#60a5fa" : "#fbbf24", border: "none", borderRadius: 10, padding: "3px 10px", fontSize: 10, cursor: "pointer", fontFamily: "Georgia,serif" }}>
                              <option value="Aguardando">Aguardando</option>
                              <option value="Em trânsito">Em trânsito</option>
                              <option value="Entregue">Entregue</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Avaliações ADM ── */}
            {adminTab === "reviews" && (
              <div>
                <h1 style={{ fontSize: 21, marginBottom: 5 }}>⭐ Avaliações</h1>
                <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 24 }}>
                  {reviews.filter(r => !r.approved).length} aguardando aprovação · {reviews.filter(r => r.approved).length} publicadas
                </p>

                {/* Pendentes */}
                {reviews.filter(r => !r.approved).length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <div style={{ fontSize: 10, letterSpacing: 2, color: "#fbbf24", textTransform: "uppercase", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: "#8b2c2c", color: "#fca5a5", fontSize: 9, padding: "2px 8px", borderRadius: 10 }}>{reviews.filter(r => !r.approved).length}</span>
                      Aguardando Aprovação
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {reviews.filter(r => !r.approved).map((r) => {
                        const wine = INITIAL_WINES.find(w => w.id === r.wineId);
                        return (
                          <div key={r.id} style={{ background: "linear-gradient(145deg,#1e1205,#160e03)", border: "1px solid #3a2a10", borderRadius: 10, padding: "16px 18px" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#8b2c2c,#5a1a1a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#e8b4b4", fontWeight: "bold", flexShrink: 0 }}>
                                    {r.author[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <span style={{ fontSize: 13, color: "#f5f0e8", fontWeight: "bold" }}>{r.author}</span>
                                    <span style={{ fontSize: 10, color: "#5a4a4a", marginLeft: 8 }}>{r.date}</span>
                                  </div>
                                  <div style={{ color: "#f59e0b", fontSize: 13 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</div>
                                </div>
                                <div style={{ fontSize: 10, color: "#b45309", marginBottom: 6 }}>Vinho: {wine?.name || "—"}</div>
                                <p style={{ fontSize: 13, color: "#a09080", lineHeight: 1.6, margin: 0 }}>{r.comment}</p>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button onClick={async () => { await dbUpdateReview({ id: r.id, approved: true }); setReviews(prev => prev.map(rv => rv.id === r.id ? { ...rv, approved: true } : rv)); }}
                                  style={{ padding: "7px 14px", background: "#1a3a1a", border: "1px solid #4ade80", color: "#4ade80", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>
                                  ✓ Aprovar
                                </button>
                                <button onClick={async () => { await dbDeleteReview(r.id); setReviews(prev => prev.filter(rv => rv.id !== r.id)); }}
                                  style={{ padding: "7px 14px", background: "none", border: "1px solid #3a1f1f", color: "#ef4444", borderRadius: 4, cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>
                                  ✕ Recusar
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Publicadas */}
                <div>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: "#4ade80", textTransform: "uppercase", marginBottom: 14 }}>
                    Avaliações Publicadas ({reviews.filter(r => r.approved).length})
                  </div>
                  {reviews.filter(r => r.approved).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px", color: "#5a4a4a", fontSize: 12 }}>Nenhuma avaliação publicada ainda.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {reviews.filter(r => r.approved).map((r) => {
                        const wine = INITIAL_WINES.find(w => w.id === r.wineId);
                        return (
                          <div key={r.id} style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 12, color: "#f5f0e8", fontWeight: "bold" }}>{r.author}</span>
                                <span style={{ color: "#f59e0b", fontSize: 12 }}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                                <span style={{ fontSize: 10, color: "#5a4a4a" }}>{r.date}</span>
                                <span style={{ fontSize: 9, color: "#8b6060", background: "#1a1410", border: "1px solid #2a1f1f", padding: "1px 7px", borderRadius: 8 }}>{wine?.name || "—"}</span>
                              </div>
                              <p style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.6, margin: 0 }}>{r.comment}</p>
                            </div>
                            <button onClick={() => setReviews(prev => prev.filter(rv => rv.id !== r.id))}
                              style={{ padding: "5px 12px", background: "none", border: "1px solid #3a1f1f", color: "#ef4444", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "Georgia,serif", flexShrink: 0 }}>
                              Remover
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* 📥 Importar CSV */}
            {adminTab === "csv" && <CSVPanel importCSV={importCSV} showToast={showToast} />}

            {/* 🎁 Cupons */}
            {adminTab === "cupons" && <CuponsPanel customCoupons={customCoupons} saveCoupons={saveCoupons} showToast={showToast} />}

            {/* 🚚 Frete */}
            {adminTab === "frete" && <FretePanel freteConfig={freteConfig} saveFreteConfig={saveFreteConfig} showToast={showToast} />}

            {/* 💳 Gateway de Pagamento */}
            {adminTab === "pagamento" && (
              <div style={{ maxWidth: 640 }}>
                <h1 style={{ fontSize: 21, marginBottom: 5 }}>💳 Gateway de Pagamento</h1>
                <p style={{ color: "#7a6a6a", fontSize: 11, marginBottom: 24 }}>Configure o gateway que será usado no checkout da loja. Suas chaves ficam salvas localmente.</p>

                {/* Gateway selector */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10, marginBottom: 24 }}>
                  {Object.entries(PAYMENT_GATEWAYS).map(([key, gw]) => (
                    <div key={key} onClick={() => { setPaymentGateway(key); setPaymentSaved(false); }}
                      style={{ background: paymentGateway === key ? "rgba(139,44,44,.2)" : "#1a1410", border: `2px solid ${paymentGateway === key ? "#8b2c2c" : "#2a1f1f"}`, borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all .2s", textAlign: "center" }}>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{gw.icon}</div>
                      <div style={{ fontSize: 12, color: paymentGateway === key ? "#e8b4b4" : "#a09080", fontWeight: "bold" }}>{gw.name}</div>
                      {paymentGateway === key && <div style={{ fontSize: 9, color: "#8b2c2c", marginTop: 4, letterSpacing: 1 }}>● SELECIONADO</div>}
                    </div>
                  ))}
                </div>

                {/* API key fields */}
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 24, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                    <span style={{ fontSize: 22 }}>{PAYMENT_GATEWAYS[paymentGateway].icon}</span>
                    <div>
                      <div style={{ fontSize: 14, color: "#e8b4b4", fontWeight: "bold" }}>{PAYMENT_GATEWAYS[paymentGateway].name}</div>
                      <div style={{ fontSize: 10, color: "#5a4a4a" }}>Insira as credenciais da sua conta</div>
                    </div>
                  </div>

                  {PAYMENT_GATEWAYS[paymentGateway].fields.map(field => (
                    <div key={field} style={{ marginBottom: 14 }}>
                      <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#5a4a4a", textTransform: "uppercase", marginBottom: 5 }}>{field}</label>
                      <input
                        type="password"
                        value={paymentKeys[`${paymentGateway}_${field}`] || ""}
                        onChange={e => setPaymentKeys(p => ({ ...p, [`${paymentGateway}_${field}`]: e.target.value }))}
                        placeholder={`Cole sua ${field} aqui…`}
                        style={{ width: "100%", background: "#0c0a09", border: "1px solid #2a1f1f", borderRadius: 4, padding: "10px 12px", color: "#f5f0e8", fontSize: 13, fontFamily: "monospace" }}
                      />
                    </div>
                  ))}

                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <button onClick={() => {
                      try { localStorage.setItem("v9_gw", paymentGateway); localStorage.setItem("v9_keys", JSON.stringify(paymentKeys)); } catch {}
                      setPaymentSaved(true); showToast(`✅ ${PAYMENT_GATEWAYS[paymentGateway].name} configurado!`);
                    }}
                      style={{ padding: "11px 24px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif", letterSpacing: 1 }}>
                      💾 Salvar Configuração
                    </button>
                    <button onClick={() => { setPaymentKeys(p => { const n = {...p}; PAYMENT_GATEWAYS[paymentGateway].fields.forEach(f => delete n[`${paymentGateway}_${f}`]); return n; }); setPaymentSaved(false); }}
                      style={{ padding: "11px 18px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#5a4a4a", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }}>
                      🗑 Limpar
                    </button>
                  </div>

                  {paymentSaved && (
                    <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(74,222,128,.07)", border: "1px solid rgba(74,222,128,.2)", borderRadius: 6, fontSize: 12, color: "#4ade80" }}>
                      ✅ {PAYMENT_GATEWAYS[paymentGateway].name} configurado e pronto para integração!
                    </div>
                  )}
                </div>

                {/* Instructions */}
                <div style={{ background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #2a1f1f", borderRadius: 10, padding: 22 }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, color: "#a09080", textTransform: "uppercase", marginBottom: 14 }}>📖 Onde encontrar suas chaves</div>
                  {paymentGateway === "mercadopago" && <div style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.9 }}>1. Acesse <strong style={{ color: "#e8b4b4" }}>mercadopago.com.br</strong><br />2. Vá em <strong style={{ color: "#e8b4b4" }}>Seu negócio → Configurações → Credenciais</strong><br />3. Copie a <strong style={{ color: "#e8b4b4" }}>Public Key</strong> e o <strong style={{ color: "#e8b4b4" }}>Access Token</strong> de produção</div>}
                  {paymentGateway === "pagseguro" && <div style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.9 }}>1. Acesse <strong style={{ color: "#e8b4b4" }}>pagseguro.uol.com.br</strong><br />2. Vá em <strong style={{ color: "#e8b4b4" }}>Minha Conta → Preferências → Integrações</strong><br />3. Copie o <strong style={{ color: "#e8b4b4" }}>E-mail</strong> e o <strong style={{ color: "#e8b4b4" }}>Token de segurança</strong></div>}
                  {paymentGateway === "stripe" && <div style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.9 }}>1. Acesse <strong style={{ color: "#e8b4b4" }}>dashboard.stripe.com</strong><br />2. Vá em <strong style={{ color: "#e8b4b4" }}>Developers → API Keys</strong><br />3. Copie a <strong style={{ color: "#e8b4b4" }}>Publishable Key</strong> e a <strong style={{ color: "#e8b4b4" }}>Secret Key</strong></div>}
                  {paymentGateway === "pagarme" && <div style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.9 }}>1. Acesse <strong style={{ color: "#e8b4b4" }}>dashboard.pagar.me</strong><br />2. Vá em <strong style={{ color: "#e8b4b4" }}>Configurações → Chaves de API</strong><br />3. Copie a <strong style={{ color: "#e8b4b4" }}>API Key</strong> e a <strong style={{ color: "#e8b4b4" }}>Encryption Key</strong></div>}
                  {paymentGateway === "cielo" && <div style={{ fontSize: 12, color: "#7a6a6a", lineHeight: 1.9 }}>1. Acesse <strong style={{ color: "#e8b4b4" }}>developercielo.github.io</strong><br />2. Crie uma conta no <strong style={{ color: "#e8b4b4" }}>Portal de Developers Cielo</strong><br />3. Copie o <strong style={{ color: "#e8b4b4" }}>MerchantId</strong> e a <strong style={{ color: "#e8b4b4" }}>MerchantKey</strong></div>}
                  <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(139,44,44,.06)", border: "1px solid rgba(139,44,44,.15)", borderRadius: 6, fontSize: 11, color: "#8b6060" }}>
                    🔒 As chaves ficam salvas apenas no estado local desta sessão. Em produção, armazene-as em variáveis de ambiente seguras no seu servidor.
                  </div>
                </div>
              </div>
            )}

            {/* 🔐 Segurança */}
            {/* 🗄️ Banco de Dados — Supabase */}
            {adminTab === "supabase" && <SupabasePanel supaCfg={supaCfg} supaConnected={supaConnected} supaStatus={supaStatus} testSupaConnection={testSupaConnection} loadFromSupabase={loadFromSupabase} showToast={showToast} />}

            {adminTab === "emails" && <EmailPanel showToast={showToast} />}
            {adminTab === "seguranca" && <SegurancaPanel showToast={showToast} />}

            {/* 🖼 Galeria de Imagens */}
            {adminTab === "imagens" && <GaleriaPanel supaCfg={supaCfg} wines={wines} setWines={setWines} supaFetch={supaFetch} showToast={showToast} />}

          </main>
        </div>
      )}

      {/* ── MODAL EDITAR ── */}
      {editWine && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={() => setEditWine(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.8)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "relative", background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 14, padding: "26px 26px 22px", width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", animation: "slideUp .3s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, color: "#e8b4b4" }}>✏️ Editar Vinho</h2>
              <button onClick={() => setEditWine(null)} style={{ background: "none", border: "none", color: "#a09080", cursor: "pointer", fontSize: 17 }}>✕</button>
            </div>
            {renderFormFields(editWine, setEditWine, editImgRef)}
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-red" onClick={handleSaveEdit} style={{ flex: 1, padding: "11px", borderRadius: 4, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>Salvar</button>
              <button className="btn-ghost" onClick={() => setEditWine(null)} style={{ padding: "11px 18px", borderRadius: 4, fontSize: 11 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 Painel Conta do Cliente */}
      {clientPanelOpen && (
        <ClientAccountPanel
          wines={wines}
          addToCart={addToCart}
          setSelectedWine={setSelectedWine}
          setPage={setPage}
          onClose={() => setClientPanelOpen(false)}
        />
      )}

      {/* DB loading indicator */}
      {dbLoading && (
        <div style={{ position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#1a1410", border: "1px solid #2a1f1f", borderRadius: 20, padding: "8px 18px", display: "flex", alignItems: "center", gap: 9, boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
          <div style={{ width: 14, height: 14, border: "2px solid #2a1f1f", borderTop: "2px solid #8b2c2c", borderRadius: "50%", animation: "spin .8s linear infinite" }} />
          <span style={{ fontSize: 11, color: "#a09080" }}>Sincronizando com Supabase…</span>
        </div>
      )}
      {showWelcomePopup && !welcomeDismissed && (
        <div style={{ position: "fixed", inset: 0, zIndex: 600, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 32, pointerEvents: "none" }}>
          <div style={{ pointerEvents: "auto", background: "linear-gradient(145deg,#1a1410,#120e0c)", border: "1px solid #8b2c2c", borderRadius: 14, padding: "22px 26px", maxWidth: 380, width: "90vw", animation: "slideUp .4s ease", boxShadow: "0 20px 60px rgba(0,0,0,.7)", position: "relative" }}>
            <button onClick={() => { setShowWelcomePopup(false); setWelcomeDismissed(true); }} style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", color: "#5a4a4a", cursor: "pointer", fontSize: 14 }}>✕</button>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14, color: "#e8b4b4", fontWeight: "bold", marginBottom: 6 }}>Bem-vindo à Vinhos9!</div>
            <p style={{ fontSize: 12, color: "#a09080", lineHeight: 1.7, marginBottom: 14 }}>
              Ganhe <strong style={{ color: "#fbbf24" }}>5% de desconto</strong> na sua primeira compra usando o cupom:
            </p>
            <div style={{ background: "#120e0c", border: "1px dashed #8b2c2c", borderRadius: 6, padding: "10px 16px", textAlign: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 18, letterSpacing: 4, color: "#fbbf24", fontWeight: "bold" }}>BEMVINDO</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setShowWelcomePopup(false); setWelcomeDismissed(true); setCartOpen(true); }}
                style={{ flex: 1, padding: "10px", background: "#8b2c2c", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif", letterSpacing: 1 }}>
                🛒 Usar Cupom
              </button>
              <button onClick={() => { setShowWelcomePopup(false); setWelcomeDismissed(true); }}
                style={{ padding: "10px 16px", background: "none", border: "1px solid #2a1f1f", borderRadius: 4, color: "#5a4a4a", cursor: "pointer", fontSize: 11, fontFamily: "Georgia,serif" }}>
                Depois
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔍 Image Zoom Modal */}
      {zoomWine && <ImageZoomModal wine={zoomWine} onClose={() => setZoomWine(null)} />}

      {page === "store" && !selectedWine && (
        <footer style={{ background: "#0a0808", borderTop: "1px solid #1a1410", padding: "26px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 20, marginBottom: 5 }}>🍷</div>
          <div style={{ fontSize: 13, letterSpacing: 3, color: "#e8b4b4", marginBottom: 5 }}>VINHOS9</div>
          <p style={{ color: "#3a2a2a", fontSize: 10 }}>© 2026 Vinhos9 Importados · Todos os direitos reservados</p>
        </footer>
      )}
    </div>
  );
}
