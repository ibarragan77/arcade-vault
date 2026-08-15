export default function Home() {
  return (
    <section className="av-hero">
      <h1 className="flicker">ARCADE VAULT</h1>
      <div className="sub">
        INSERTA UNA MONEDA PARA JUGAR <span className="blink">_</span>
      </div>
      <div className="detail-actions" style={{ justifyContent: "center" }}>
        <button className="btn lg">JUGAR AHORA</button>
        <button className="btn magenta lg">VER SALÓN</button>
        <button className="btn ghost lg">INICIAR SESIÓN</button>
      </div>
    </section>
  );
}
