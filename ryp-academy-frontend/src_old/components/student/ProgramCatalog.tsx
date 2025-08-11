import React, { useState } from 'react';
import Card from '../Card';

export type Program = {
  id: string;
  name: string;
  description?: string;
  type: string;
  price?: string;
  capacity?: string;
  duration?: string;
  schedule_details?: string;
  isActive?: boolean;
};

type ProgramCatalogProps = {
  programs: Program[];
  onEnroll: (program: Program) => void;
};

const ProgramCatalog: React.FC<ProgramCatalogProps> = ({ programs, onEnroll }) => {
  const [search, setSearch] = useState('');
  const filtered = programs.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );
  return (
    <Card>
      <h3 className="font-semibold mb-2">Program Catalog</h3>
      <input
        className="w-full border rounded px-3 py-2 mb-2"
        placeholder="Search programs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="border rounded p-2 flex flex-col justify-between"
          >
            <div>
              <div className="font-bold">{p.name}</div>
              <div className="text-sm">{p.description}</div>
              <div className="text-xs text-gray-500">
                Type: {p.type} {p.price && `| Price: $${p.price}`}
              </div>
            </div>
            <button
              className="mt-2 px-2 py-1 bg-yellow-400 rounded hover:bg-yellow-500 font-semibold"
              onClick={() => onEnroll(p)}
            >
              Enroll
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default ProgramCatalog; 