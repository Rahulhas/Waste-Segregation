import { useEffect, useRef, useState } from 'react';

export default function CameraCapture({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera() {
    setError('');
    setIsLoading(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not supported by this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Camera error:', err);

      setIsLoading(false);

      if (err.name === 'NotAllowedError') {
        setError(
          'Camera permission was denied. Please allow camera access in your browser settings.'
        );
      } else if (err.name === 'NotFoundError') {
        setError('No camera was found on this device.');
      } else {
        setError('Unable to access the camera. Please try again.');
      }
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  function handleCapture() {
    const video = videoRef.current;

    if (!video || video.readyState < 2) {
      setError('Camera is not ready yet. Please wait a moment.');
      return;
    }

    const canvas = document.createElement('canvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Unable to capture the image. Please try again.');
          return;
        }

        const file = new File(
          [blob],
          `waste-camera-${Date.now()}.jpg`,
          {
            type: 'image/jpeg',
          }
        );

        stopCamera();
        onCapture(file);
      },
      'image/jpeg',
      0.9
    );
  }

  function handleClose() {
    stopCamera();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-forest">
              Capture Waste Image
            </h2>

            <p className="text-sm text-text-secondary">
              Position the waste inside the camera frame.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close camera"
            className="rounded-lg px-3 py-2 text-xl text-text-secondary hover:bg-sage-50"
          >
            ×
          </button>
        </div>

        {/* Camera */}
        <div className="relative aspect-video bg-black">
          {isLoading && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              Starting camera...
            </div>
          )}

          {error ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 text-4xl">📷</div>

              <p className="max-w-md text-sm text-red-600">
                {error}
              </p>

              <button
                type="button"
                onClick={startCamera}
                className="mt-4 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-pine"
              >
                Try Again
              </button>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 px-5 py-5">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-divider px-5 py-2.5 text-sm font-medium text-text-secondary hover:bg-sage-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={isLoading || Boolean(error)}
            className="rounded-lg bg-forest px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-pine disabled:cursor-not-allowed disabled:opacity-50"
          >
            📸 Capture Image
          </button>
        </div>
      </div>
    </div>
  );
}