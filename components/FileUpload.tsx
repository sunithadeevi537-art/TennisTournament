import React, { useRef } from 'react';
import Button from './Button'; // Assuming Button component exists

interface FileUploadProps {
  children?: React.ReactNode; // Added children to allow more flexible button content
  onFileSelect: (file: File) => void;
  acceptedFileTypes?: string;
  buttonText?: string;
  isDisabled?: boolean;
  className?: string; // New: Added className prop
}

const FileUpload: React.FC<FileUploadProps> = ({ children, onFileSelect, acceptedFileTypes = "image/*", buttonText = "Upload File", isDisabled = false, className }) => {
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
    <div className={`flex items-center space-x-2 ${className}`}>
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
        {children || buttonText}
      </Button>
      <span className="text-gray-600 text-sm"></span>
    </div>
  );
};

export default FileUpload;