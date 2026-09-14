import { useState, useEffect } from 'react';
import { Button, Card } from '../../components/ui';
import { api } from '../../lib/api';

const MOCK_HISTORY = [
  {
    id: 1,
    date: '02 Sep 2026',
    time: '12:05 PM',
    waste: 'Plastic',
    confidence: 96.4,
    bin: 'Plastic Waste Bin',
    icon: '🥤',
  },
  {
    id: 2,
    date: '01 Sep 2026',
    time: '04:30 PM',
    waste: 'Paper',
    confidence: 92.1,
    bin: 'Paper Waste Bin',
    icon: '📄',
  },
  {
    id: 3,
    date: '31 Aug 2026',
    time: '11:15 AM',
    waste: 'Organic',
    confidence: 89.7,
    bin: 'Organic Waste Bin',
    icon: '🍎',
  },
  {
    id: 4,
    date: '30 Aug 2026',
    time: '03:45 PM',
    waste: 'Metal',
    confidence: 94.8,
    bin: 'Metal Waste Bin',
    icon: '🥫',
  },
  {
    id: 5,
    date: '29 Aug 2026',
    time: '10:20 AM',
    waste: 'Glass',
    confidence: 91.6,
    bin: 'Glass Waste Bin',
    icon: '🍾',
  },
];

export default function HistoryPage() {
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem('ecosort_prediction_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return MOCK_HISTORY;
  });

  useEffect(() => {
    async function loadHistory() {
      try {
        const data = await api.getWasteHistory('limit=50');
        if (data && data.success && Array.isArray(data.predictions) && data.predictions.length > 0) {
          const mapped = data.predictions.map((p) => {
            const dt = new Date(p.created_at);
            const validDate = !isNaN(dt.getTime());
            return {
              id: p.id,
              date: validDate ? dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : String(p.created_at).slice(0, 10),
              time: validDate ? dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '',
              waste: p.prediction,
              confidence: p.confidence_pct ?? (p.confidence * 100),
              bin: p.recommended_bin,
              icon: p.icon || '♻️',
            };
          });
          setHistory(mapped);
        }
      } catch (err) {
        // Fall back quietly to local storage
        console.warn('Backend history fetch failed, using local storage:', err.message);
      }
    }

    loadHistory();
  }, []);

  function clearHistory() {
    try {
      localStorage.removeItem('ecosort_prediction_history');
    } catch {
      // ignore
    }
    setHistory([]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-sage-700">
            EcoSort AI
          </p>

          <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">
            Prediction History
          </h1>

          <p className="mt-2 max-w-2xl text-text-secondary">
            View your previous waste analysis results and AI predictions.
          </p>
        </div>

        {history.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={clearHistory}
          >
            Clear History
          </Button>
        )}
      </div>

      {/* Statistics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">

        <Card>
          <p className="text-sm text-text-secondary">
            Total Analyses
          </p>

          <p className="mt-2 text-3xl font-bold text-forest">
            {history.length}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-text-secondary">
            Average Confidence
          </p>

          <p className="mt-2 text-3xl font-bold text-forest">
            {history.length > 0
              ? (
                  history.reduce(
                    (sum, item) => sum + item.confidence,
                    0
                  ) / history.length
                ).toFixed(1)
              : '0.0'}
            %
          </p>
        </Card>

        <Card>
          <p className="text-sm text-text-secondary">
            Latest Prediction
          </p>

          <p className="mt-2 text-2xl font-bold text-forest">
            {history.length > 0 ? history[0].waste : 'None'}
          </p>
        </Card>

      </div>

      {/* History Table */}
      <Card className="overflow-hidden p-0">

        <div className="border-b border-divider px-6 py-5">
          <h2 className="text-lg font-semibold text-text-primary">
            Recent Predictions
          </h2>

          <p className="mt-1 text-sm text-text-secondary">
            Your recent AI waste classifications.
          </p>
        </div>

        {history.length === 0 ? (

          /* Empty State */
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">

            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sage-50 text-3xl">
              ♻️
            </div>

            <h3 className="text-xl font-semibold text-text-primary">
              No prediction history
            </h3>

            <p className="mt-2 max-w-md text-sm text-text-secondary">
              Your waste analysis results will appear here after you analyze
              an image.
            </p>

          </div>

        ) : (

          <div className="overflow-x-auto">

            <table className="w-full min-w-[750px]">

              <thead>
                <tr className="border-b border-divider bg-sage-50/60 text-left">

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Date
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Waste Type
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Confidence
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Recommended Bin
                  </th>

                  <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Status
                  </th>

                </tr>
              </thead>

              <tbody>

                {history.map((item) => (

                  <tr
                    key={item.id}
                    className="border-b border-divider last:border-0 hover:bg-sage-50/40"
                  >

                    {/* Date */}
                    <td className="px-6 py-5">

                      <p className="font-medium text-text-primary">
                        {item.date}
                      </p>

                      <p className="mt-1 text-xs text-text-muted">
                        {item.time}
                      </p>

                    </td>

                    {/* Waste */}
                    <td className="px-6 py-5">

                      <div className="flex items-center gap-3">

                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mint text-xl">
                          {item.icon}
                        </div>

                        <span className="font-semibold text-forest">
                          {item.waste}
                        </span>

                      </div>

                    </td>

                    {/* Confidence */}
                    <td className="px-6 py-5">

                      <div className="w-32">

                        <div className="mb-1 flex justify-between">

                          <span className="text-sm font-semibold text-forest">
                            {item.confidence}%
                          </span>

                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-sage-100">

                          <div
                            className="h-full rounded-full bg-forest"
                            style={{
                              width: `${item.confidence}%`,
                            }}
                          />

                        </div>

                      </div>

                    </td>

                    {/* Bin */}
                    <td className="px-6 py-5">

                      <span className="rounded-full bg-mint px-3 py-1.5 text-sm font-medium text-forest">
                        {item.bin}
                      </span>

                    </td>

                    {/* Status */}
                    <td className="px-6 py-5">

                      <span className="inline-flex rounded-full bg-sage-50 px-3 py-1.5 text-xs font-semibold text-sage-700">
                        Analyzed
                      </span>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

      </Card>

    </div>
  );
}