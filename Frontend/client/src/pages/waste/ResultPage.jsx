import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Alert } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { getDefaultRoute } from '../../lib/roles';

const WASTE_INFO = {
  'Food Organics': {
    bin: 'Organic / Wet Waste Bin',
    recommendation:
      'Place food scraps, leftovers, and kitchen organic waste in the green wet waste or compost bin.',
    icon: '🍎',
  },
  Vegetation: {
    bin: 'Yard / Organic Waste Bin',
    recommendation:
      'Place garden clippings, leaves, flowers, and plant waste in the compost or yard waste bin.',
    icon: '🌿',
  },
  Cardboard: {
    bin: 'Paper / Cardboard Recycling Bin',
    recommendation:
      'Flatten cardboard boxes to save space, ensure they are dry, and place in the dry recyclables bin.',
    icon: '📦',
  },
  cardboard: {
    bin: 'Paper / Cardboard Recycling Bin',
    recommendation:
      'Flatten cardboard boxes to save space, ensure they are dry, and place in the dry recyclables bin.',
    icon: '📦',
  },
  Plastic: {
    bin: 'Plastic Waste Bin',
    recommendation:
      'Clean and rinse plastic bottles or packaging, then place them in the designated plastic recycling bin.',
    icon: '🥤',
  },
  plastic: {
    bin: 'Plastic Waste Bin',
    recommendation:
      'Clean and rinse plastic bottles or packaging, then place them in the designated plastic recycling bin.',
    icon: '🥤',
  },
  Paper: {
    bin: 'Paper Waste Bin',
    recommendation:
      'Keep paper dry and clean. Place newspapers, office paper, and magazines in the paper recycling bin.',
    icon: '📄',
  },
  paper: {
    bin: 'Paper Waste Bin',
    recommendation:
      'Keep paper dry and clean. Place newspapers, office paper, and magazines in the paper recycling bin.',
    icon: '📄',
  },
  Organic: {
    bin: 'Organic Waste Bin',
    recommendation:
      'Place organic waste in the wet/organic waste bin for composting or proper processing.',
    icon: '🍎',
  },
  Metal: {
    bin: 'Metal Waste Bin',
    recommendation:
      'Rinse metal cans and place them into the designated metal recycling bin.',
    icon: '🥫',
  },
  metal: {
    bin: 'Metal Waste Bin',
    recommendation:
      'Rinse metal cans and place them into the designated metal recycling bin.',
    icon: '🥫',
  },
  Glass: {
    bin: 'Glass Waste Bin',
    recommendation:
      'Handle glass carefully, remove lids, and place in the designated glass recycling bin.',
    icon: '🍾',
  },
  glass: {
    bin: 'Glass Waste Bin',
    recommendation:
      'Handle glass carefully, remove lids, and place in the designated glass recycling bin.',
    icon: '🍾',
  },
  'Textile Trash': {
    bin: 'Textile / Donation Bin',
    recommendation:
      'Donate usable clothing to charity, or place damaged fabrics in designated textile recycling bins.',
    icon: '👕',
  },
  Other: {
    bin: 'General Waste Bin',
    recommendation:
      'This item could not be categorized. Dispose of it according to local municipal waste guidelines.',
    icon: '♻️',
  },
};


export default function ResultPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const result = location.state?.result;
  const imageUrl = location.state?.imageUrl;

  // If someone opens /result directly without analyzing an image
  if (!result || !imageUrl) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-50 text-3xl">
            ♻️
          </div>

          <h1 className="text-2xl font-bold text-text-primary">
            No Analysis Found
          </h1>

          <p className="mx-auto mt-2 max-w-md text-text-secondary">
            Please upload or capture a waste image first to see the AI
            prediction.
          </p>

          <Button
            type="button"
            onClick={() => navigate('/analyze')}
            className="mt-6"
          >
            Analyze Waste
          </Button>
        </Card>
      </div>
    );
  }

  const prediction = result.prediction || 'Other';

  const confidence =
    typeof result.confidence === 'number'
      ? result.confidence
      : Number(result.confidence || 0);

  const confidencePercentage =
    confidence <= 1 ? confidence * 100 : confidence;

  const wasteInfo = WASTE_INFO[prediction] || WASTE_INFO.Other;

  const recommendedBin =
    result.recommended_bin || wasteInfo.bin;

  const isLowConfidence = confidencePercentage < 80;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-sage-700">
          EcoSort AI
        </p>

        <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">
          Waste Analysis Result
        </h1>

        <p className="mt-2 max-w-2xl text-text-secondary">
          Our AI has analyzed your waste image and identified the most likely
          waste category.
        </p>
      </div>

      {/* Low confidence warning */}
      {isLowConfidence && (
        <div className="mb-6">
          <Alert variant="warning">
            Low confidence prediction. Please verify the result manually.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">

        {/* Image */}
        <Card>
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              Analyzed Image
            </h2>

            <p className="mt-1 text-sm text-text-muted">
              Image submitted for AI classification
            </p>
          </div>

          <div className="flex min-h-[350px] items-center justify-center overflow-hidden rounded-xl bg-sage-50">
            <img
              src={imageUrl}
              alt="Waste submitted for analysis"
              className="max-h-[500px] w-full object-contain"
            />
          </div>
        </Card>

        {/* Result */}
        <div className="flex flex-col gap-6">

          {/* Detection Card */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                Detected Waste
              </h2>

              <span className="rounded-full bg-mint px-3 py-1 text-xs font-semibold text-forest">
                AI Result
              </span>
            </div>

            <div className="rounded-xl bg-sage-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Waste Category
              </p>

              <div className="mt-2 flex items-center gap-3">
                <span className="text-3xl">{result.icon || wasteInfo.icon || '♻️'}</span>
                <h3 className="text-3xl font-bold uppercase text-forest">
                  {prediction}
                </h3>
              </div>
            </div>
          </Card>

          {/* Confidence Card */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary">
              AI Confidence
            </h2>

            <div className="mt-5 flex items-end justify-between">
              <span className="text-sm text-text-secondary">
                Prediction confidence
              </span>

              <span className="text-2xl font-bold text-forest">
                {confidencePercentage.toFixed(1)}%
              </span>
            </div>

            {/* Progress bar */}
            <div
              className="mt-3 h-3 overflow-hidden rounded-full bg-sage-100"
              role="progressbar"
              aria-valuenow={confidencePercentage}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="AI prediction confidence"
            >
              <div
                className="h-full rounded-full bg-forest transition-all duration-700"
                style={{
                  width: `${Math.min(confidencePercentage, 100)}%`,
                }}
              />
            </div>

            <p className="mt-3 text-xs text-text-muted">
              {isLowConfidence
                ? 'The AI is not highly certain about this prediction.'
                : 'The AI has high confidence in this prediction.'}
            </p>
          </Card>

          {/* Bin Recommendation */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary">
              Recommended Bin
            </h2>

            <div className="mt-4 flex items-center gap-4 rounded-xl bg-mint/60 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-forest text-2xl">
                🗑️
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Dispose in
                </p>

                <p className="mt-1 font-bold text-forest">
                  {recommendedBin}
                </p>
              </div>
            </div>
          </Card>

        </div>
      </div>

      {/* Disposal recommendation */}
      <Card className="mt-6">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sage-50 text-2xl">
            🌱
          </div>

          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Disposal Recommendation
            </h2>

            <p className="mt-2 leading-6 text-text-secondary">
              {result.recommendation || wasteInfo.recommendation}
            </p>
          </div>
        </div>
      </Card>

      {/* Class Probability Breakdown */}
      {result.top_predictions && result.top_predictions.length > 0 && (
        <Card className="mt-6">
          <h2 className="text-lg font-semibold text-text-primary">
            AI Probability Distribution
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Evaluation across trained waste categories
          </p>

          <div className="mt-4 space-y-3">
            {result.top_predictions.map((item, idx) => {
              const pct = item.confidence_pct ?? Number((item.confidence * 100).toFixed(1));
              return (
                <div key={idx} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-text-secondary">
                      {item.display_name || item.class_name}
                    </span>
                    <span className="font-semibold text-forest">
                      {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sage-100">
                    <div
                      className="h-full rounded-full bg-forest transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Buttons */}
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <Button
          type="button"
          onClick={() => navigate('/analyze')}
        >
          Analyze Another
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(getDefaultRoute(user?.role))}
        >
          Back to Dashboard
        </Button>
      </div>

    </div>
  );
}