'use client';

interface DebugPanelProps {
  reportData: any;
  selectedDate: string;
  loading: boolean;
  error: string | null;
}

export function DebugPanel({ reportData, selectedDate, loading, error }: DebugPanelProps) {
  return (
    <div className="mt-8 p-4 bg-gray-800 border border-gray-700 rounded-lg">
      <h3 className="text-lg font-bold mb-4">디버그 정보</h3>
      <div className="space-y-2 text-sm font-mono">
        <div>
          <span className="text-gray-400">Selected Date:</span>{' '}
          <span className="text-white">{selectedDate || 'N/A'}</span>
        </div>
        <div>
          <span className="text-gray-400">Loading:</span>{' '}
          <span className="text-white">{loading ? 'true' : 'false'}</span>
        </div>
        <div>
          <span className="text-gray-400">Error:</span>{' '}
          <span className="text-red-400">{error || 'null'}</span>
        </div>
        <div>
          <span className="text-gray-400">Report Data:</span>{' '}
          <span className="text-white">
            {reportData ? `OK (${reportData.tables?.length || 0} tables)` : 'null'}
          </span>
        </div>
        {reportData && (
          <details className="mt-4">
            <summary className="cursor-pointer text-blue-400">Raw JSON</summary>
            <pre className="mt-2 p-2 bg-gray-900 rounded overflow-auto max-h-96 text-xs">
              {JSON.stringify(reportData, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
