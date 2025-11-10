import React, { useRef } from 'react';
import Button from './Button'; // Assuming Button component exists

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  acceptedFileTypes?: string;
  buttonText?: string;
  isDisabled?: boolean; // New prop to disable upload
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, acceptedFileTypes = "image/*", buttonText = "Upload File", isDisabled = false }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      onFileSelect(event.target.files[0]);
      // Optionally reset the input to allow re-uploading the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleButtonClick = () => {
    if (!isDisabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <input
        id="file-upload"
        name="file-upload"
        type="file"
        accept={acceptedFileTypes}
        onChange={handleFileChange}
        ref={fileInputRef}
        className="hidden"
        disabled={isDisabled}
      />
      <Button onClick={handleButtonClick} variant="secondary" disabled={isDisabled}>
        {buttonText}
      </Button>
      <span className="text-gray-600 text-sm"></span>
    </div>
  );
};

export default FileUpload;