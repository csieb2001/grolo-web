export const dynamic = "force-dynamic";

const T = {
  en: { title: "Sign in", hint: "This page mirrors a private solar battery. Enter the access password.", pw: "Password", go: "Sign in", bad: "Wrong password." },
  de: { title: "Anmelden", hint: "Diese Seite spiegelt einen privaten Balkonspeicher. Bitte das Zugangspasswort eingeben.", pw: "Passwort", go: "Anmelden", bad: "Falsches Passwort." },
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; lang?: string }> }) {
  const sp = await searchParams;
  const lang = sp.lang === "de" ? "de" : "en";
  const t = T[lang];
  const other = lang === "de" ? "en" : "de";
  return (
    <main style={{ minHeight: "80vh", display: "grid", placeItems: "center" }}>
      <section style={{ width: "min(420px, 92vw)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>GroLo <small className="muted" style={{ fontSize: 12, fontWeight: 400 }}>Growatt Local</small></h1>
          <span className="spacer" />
          <a href={`/login?lang=${other}`} style={{ fontSize: 12 }}>{other.toUpperCase()}</a>
        </div>
        <h2 style={{ marginTop: 10 }}>{t.title}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t.hint}</p>
        <form method="post" action="/api/login" style={{ display: "grid", gap: 10 }}>
          <input type="hidden" name="lang" value={lang} />
          <input name="password" type="password" placeholder={t.pw} autoFocus required
                 style={{ background: "#0f1114", color: "var(--text)", border: "1px solid #3a4046", borderRadius: 4, padding: "10px 12px", fontSize: 15 }} />
          {sp.error && <div style={{ color: "var(--red)", fontSize: 13 }}>{t.bad}</div>}
          <button type="submit" style={{ background: "#3d5a80", color: "#fff", border: "1px solid #4a6d9a", borderRadius: 4, padding: "10px 12px", fontSize: 14, cursor: "pointer" }}>{t.go}</button>
        </form>
      </section>
    </main>
  );
}
