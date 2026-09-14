import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Alert } from '../../components/ui';
import CameraCapture from '../../components/waste/CameraCapture';
import { api } from '../../lib/api';

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export default function AnalyzePage() {
  const fileInputRef = useRef(null);
  const navigate = useNavigate();  

const [selectedImage, setSelectedImage] = useState(null);
const [previewUrl, setPreviewUrl] = useState('');
const [error, setError] = useState('');
const [isAnalyzing, setIsAnalyzing] = useState(false);
const [showCamera, setShowCamera] = useState(false);

  function validateFile(file) {
    if (!file) {
      return 'Please select an image.';
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid image format. Please upload JPG, JPEG, PNG, or WEBP.';
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'Image size must be less than 5 MB.';
    }

    return '';
  }

  function handleFile(file) {
    setError('');

    const validationError = validateFile(file);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSelectedImage(file);

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (file) {
      handleFile(file);
    }
  }
  function handleCameraCapture(file) {
  setShowCamera(false);
  handleFile(file);
}

  function handleDrop(event) {
    event.preventDefault();

    const file = event.dataTransfer.files?.[0];

    if (file) {
      handleFile(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
  }

  function removeImage() {
    setSelectedImage(null);
    setPreviewUrl('');
    setError('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleAnalyze() {
    if (!selectedImage) {
      setError('Please select an image before analyzing.');
      return;
    }

    setError('');
    setIsAnalyzing(true);

    try {
      const result = await api.analyzeWaste(selectedImage);

      // Save to prediction history in localStorage
      try {
        const stored = localStorage.getItem('ecosort_prediction_history');
        const existingHistory = stored ? JSON.parse(stored) : [];
        const now = new Date();
        const newEntry = {
          id: Date.now(),
          date: now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
          time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
          waste: result.prediction || 'Unknown',
          confidence: result.confidence_percentage ?? (result.confidence ? Math.round(result.confidence * 1000) / 10 : 0),
          bin: result.recommended_bin || 'General Waste Bin',
          icon: result.icon || '♻️',
        };
        const updated = [newEntry, ...existingHistory].slice(0, 50);
        localStorage.setItem('ecosort_prediction_history', JSON.stringify(updated));
      } catch (storageErr) {
        console.warn('Could not save to localStorage:', storageErr);
      }

      navigate('/result', {
        state: {
          result,
          imageUrl: previewUrl,
        },
      });
    } catch (err) {
      console.error('Waste analysis error:', err);
      setError(err.message || 'Failed to analyze waste image. Please check server connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-sage-700">
          EcoSort AI
        </p>

        <h1 className="text-3xl font-bold text-text-primary sm:text-4xl">
          Analyze Waste
        </h1>

        <p className="mt-2 max-w-2xl text-text-secondary">
          Upload an image of waste and let our AI identify the appropriate
          waste category and disposal bin.
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <Alert variant="error">
            {error}
          </Alert>
        </div>
      )}

      {!selectedImage ? (
        <Card className="p-0">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-sage-300 bg-sage-50/40 p-8 text-center transition-colors hover:border-sage-500 hover:bg-sage-50"
          >
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-mint text-3xl">
              ♻️
            </div>

            <h2 className="text-xl font-semibold text-text-primary">
              Upload your waste image
            </h2>

            <p className="mt-2 max-w-md text-sm text-text-secondary">
              Drag and drop your image here, or click the button below to
              browse your device.
            </p>

            <div className="mt-6">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Image
              </Button>
               <Button
                 type="button"
                 variant="secondary"
                 onClick={() => {
                   setError('');
                   setShowCamera(true);
                 }}
               >
                   📷 Use Camera
               </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <p className="mt-5 text-xs text-text-muted">
              Supported: JPG, JPEG, PNG, WEBP · Maximum size: 5 MB
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-text-primary">
                  Image Preview
                </h2>

                <p className="mt-1 text-sm text-text-muted">
                  {selectedImage.name}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-sage-50">
              <img
                src={previewUrl}
                alt="Selected waste"
                className="mx-auto max-h-[500px] w-full object-contain"
              />
            </div>
          </Card>

          <Card className="h-fit">
            <h2 className="font-semibold text-text-primary">
              Ready to analyze?
            </h2>

            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Our AI will identify the waste category and recommend the
              appropriate disposal bin.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <Button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full"
              >
                {isAnalyzing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Analyzing with AI...
                  </span>
                ) : (
                  'Analyze Waste'
                )}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={removeImage}
                disabled={isAnalyzing}
                className="w-full"
              >
                Remove Image
              </Button>
            </div>
          </Card>
        </div>
      )}
      {showCamera && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}