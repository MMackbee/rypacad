import React, { type ReactNode } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  onClose: () => void;
  children?: ReactNode;
};

const Modal: React.FC<ModalProps> = ({ open, title, message, onClose, children }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-bold mb-2">{title}</h2>
        <div className="mb-4">{message}</div>
        {children}
        <button
          className="mt-4 px-4 py-2 bg-yellow-400 hover:bg-yellow-500 rounded font-semibold"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default Modal; 