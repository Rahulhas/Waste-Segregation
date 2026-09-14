import { Logo } from './ui';

const HERO_IMAGES = {
  forest: '/backgrounds/forest-canopy.jpg',
  leaves: '/backgrounds/green-leaves.jpg',
  nature: '/backgrounds/misty-nature.jpg',
  earth: '/backgrounds/sustainable-earth.jpg',
};

export default function AuthLayout({
  children,
  heroImage = 'forest',
  heroTitle = 'Smart Waste Segregation',
  heroSubtitle = 'for Campus Operations',
  heroDescription = 'Unified dispatch, segregation audit, analytics, and real-time alerts — built for SIH 2026 municipal sustainability goals.',
  heroFooter = (
    <>
      <div>
        <div className="font-semibold text-white">3 Roles</div>
        Driver · Admin · Operator
      </div>
      <div>
        <div className="font-semibold text-white">Real-time</div>
        Bin capacity & alerts
      </div>
    </>
  ),
}) {
  const imageUrl = HERO_IMAGES[heroImage] || HERO_IMAGES.forest;

  return (
    <div
      className="auth-page"
      style={{ backgroundImage: `url('${imageUrl}')` }}
    >
      <div className="auth-page__overlay" />

      <div className="auth-page__brand">
        <Logo size="lg" variant="light" />
        <div className="auth-page__headline">
          <h1 className="text-2xl font-semibold leading-tight text-white drop-shadow-sm sm:text-3xl">
            {heroTitle}
            {heroSubtitle && (
              <>
                <br />
                {heroSubtitle}
              </>
            )}
          </h1>
          {heroDescription && (
            <p className="mt-3 max-w-lg text-sm text-white/90 sm:text-base">{heroDescription}</p>
          )}
        </div>
      </div>

      <div className="auth-page__content">{children}</div>

      {heroFooter && (
        <div className="auth-page__footer">{heroFooter}</div>
      )}
    </div>
  );
}
