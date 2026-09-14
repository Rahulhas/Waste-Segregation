export default function EcoBackground() {
  return (
    <div className="eco-bg" aria-hidden="true">
      <div
        className="eco-bg__photo eco-bg__photo--main"
        style={{ backgroundImage: "url('/backgrounds/forest-canopy.jpg')" }}
      />
      <div
        className="eco-bg__photo eco-bg__photo--leaves"
        style={{ backgroundImage: "url('/backgrounds/green-leaves.jpg')" }}
      />
      <div
        className="eco-bg__photo eco-bg__photo--nature"
        style={{ backgroundImage: "url('/backgrounds/misty-nature.jpg')" }}
      />
      <div
        className="eco-bg__photo eco-bg__photo--earth"
        style={{ backgroundImage: "url('/backgrounds/sustainable-earth.jpg')" }}
      />

      <img src="/backgrounds/leaf-accent.svg" alt="" className="eco-bg__accent eco-bg__accent--leaf-1" />
      <img src="/backgrounds/leaf-accent.svg" alt="" className="eco-bg__accent eco-bg__accent--leaf-2" />
      <img src="/backgrounds/eco-globe.svg" alt="" className="eco-bg__accent eco-bg__accent--globe" />

      <div className="eco-bg__overlay" />
      <div className="eco-bg__pattern" />
    </div>
  );
}
