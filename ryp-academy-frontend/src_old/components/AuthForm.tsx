import React, { useState } from 'react';
import Card from './Card';
import Modal from './Modal';
import { auth } from '../firebase/config';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const AuthForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [modal, setModal] = useState({ open: false, title: '', message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setModal({ open: true, title: 'Auth Error', message: err.message });
    }
  };

  return (
    <Card className="max-w-md mx-auto mt-12">
      <h2 className="text-2xl font-bold mb-4 text-center">
        {isRegister ? 'Register' : 'Login'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          className="w-full border rounded px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full border rounded px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          className="w-full bg-black text-yellow-400 font-bold py-2 rounded hover:bg-yellow-400 hover:text-black transition"
          type="submit"
        >
          {isRegister ? 'Register' : 'Login'}
        </button>
      </form>
      <div className="mt-4 text-center">
        <button
          className="text-blue-500 underline"
          onClick={() => setIsRegister((r) => !r)}
        >
          {isRegister
            ? 'Already have an account? Login'
            : "Don't have an account? Register"}
        </button>
      </div>
      <Modal
        open={modal.open}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal({ ...modal, open: false })}
      />
    </Card>
  );
};

export default AuthForm; 