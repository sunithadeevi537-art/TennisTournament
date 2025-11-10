import React, { useRef, useEffect, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import Card from './Card';
import Button from './Button';

interface QRScannerProps {
  onScan: (data: string) => void;
  onClose: () => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const qrCodeScannerId = "qr-code-scanner"; // Unique ID for the scanner element

  useEffect(() => {
    if (!scannerRef.current) {
      scannerRef.current = new Html5QrcodeScanner(
        qrCodeScannerId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          rememberLastUsedCamera: true,
          supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        },
        /* verbose= */ false,
      );
    }

    return () => {
      // Clean up the scanner when the component unmounts
      if (isScanning && scannerRef.current) {
        scannerRef.current.stop().catch((err) => console.error("Failed to stop QR scanner:", err));
      }
    };
  }, [isScanning]);

  const startScanning = () => {
    if (scannerRef.current) {
      scannerRef.current.render(onScanSuccess, onScanError);
      setIsScanning(true);
    }
  };

  const stopScanning = () => {
    if (scannerRef.current && isScanning) {
      scannerRef.current.stop().then(() => {
        setIsScanning(false);
        onClose();
      }).catch((err) => {
        console.error("Failed to stop QR scanner:", err);
        setIsScanning(false); // Even on error, try to reset state
        onClose();
      });
    } else {
      onClose(); // If not scanning, just close
    }
  };

  const onScanSuccess = (decodedText: string) => {
    console.log(`QR code detected: ${decodedText}`);
    onScan(decodedText);
    stopScanning(); // Stop scanner after successful scan
  };

  const onScanError = (errorMessage: string) => {
    // console.warn(`QR scan error: ${errorMessage}`);
  };

  return (
    <Card className="p-4 bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">Scan QR Code</h3>
      {!isScanning && (
        <Button onClick={startScanning} className="mb-4">
          Start QR Scanner
        </Button>
      )}
      <div id={qrCodeScannerId} className="w-full h-64 md:h-80 lg:h-96 bg-gray-200 flex items-center justify-center text-gray-500 rounded-md">
        {!isScanning && <p>Click "Start QR Scanner" to activate camera</p>}
      </div>
      {isScanning && (
        <Button variant="secondary" onClick={stopScanning} className="mt-4">
          Stop Scanner
        </Button>
      )}
    </Card>
  );
};

export default QRScanner;