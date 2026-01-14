'use client';

interface DateSelectorProps {
  value: string;
  onChange: (date: string) => void;
}

export function DateSelector({ value, onChange }: DateSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-400">날짜 선택:</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
        max={new Date().toISOString().split('T')[0]}
      />
    </div>
  );
}
