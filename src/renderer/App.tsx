import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Play,
  XCircle
} from 'lucide-react';
import type { BatchRowView } from './types';

const statusMeta: Record<BatchRowView['status'], { label: string; className: string; icon: LucideIcon }> = {
  pending: {
    label: '等待',
    className: 'bg-slate-100 text-slate-700',
    icon: Loader2
  },
  success: {
    label: '成功',
    className: 'bg-emerald-50 text-emerald-700',
    icon: CheckCircle2
  },
  warning: {
    label: '有提示',
    className: 'bg-amber-50 text-amber-700',
    icon: AlertTriangle
  },
  error: {
    label: '异常',
    className: 'bg-red-50 text-red-700',
    icon: XCircle
  }
};

function displayPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

export function App() {
  const [styleNumberText, setStyleNumberText] = useState('');
  const [workbookPaths, setWorkbookPaths] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BatchRowView[]>([]);
  const [workbookPath, setWorkbookPath] = useState('');
  const [error, setError] = useState('');

  const canRun = useMemo(
    () => Boolean(styleNumberText.trim() && workbookPaths.length > 0 && outputDir && !running),
    [styleNumberText, workbookPaths.length, outputDir, running]
  );

  const stats = useMemo(
    () => ({
      success: rows.filter((row) => row.status === 'success').length,
      warning: rows.filter((row) => row.status === 'warning').length,
      error: rows.filter((row) => row.status === 'error').length
    }),
    [rows]
  );

  const selectWorkbooks = async () => {
    const selected = await window.zhongkongtai.selectWorkbooks();
    if (selected.length > 0) {
      setWorkbookPaths(selected);
    }
  };

  const selectOutputDir = async () => {
    const selected = await window.zhongkongtai.selectOutputDir();
    if (selected) {
      setOutputDir(selected);
    }
  };

  const run = async () => {
    if (!canRun) return;

    setRunning(true);
    setRows([]);
    setWorkbookPath('');
    setError('');

    try {
      const result = await window.zhongkongtai.processWithoutAi({ styleNumberText, workbookPaths, outputDir });
      setRows(result.rows.map(({ styleNumber, status, reason }) => ({ styleNumber, status, reason })));
      setWorkbookPath(result.workbookPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-semibold">中控台</h1>
            <p className="mt-1 text-sm text-slate-500">本地商品资料处理</p>
          </div>
          <div className="flex gap-2 text-sm">
            <span className="rounded-md bg-white px-3 py-2 text-slate-600 ring-1 ring-slate-200">
              Excel {workbookPaths.length}
            </span>
            <span className="rounded-md bg-white px-3 py-2 text-slate-600 ring-1 ring-slate-200">
              结果 {rows.length}
            </span>
          </div>
        </header>

        <section className="grid min-h-[420px] grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-semibold" htmlFor="style-numbers">
                款号列表
              </label>
              <span className="text-xs text-slate-500">{styleNumberText.trim() ? '已输入' : '空'}</span>
            </div>
            <textarea
              id="style-numbers"
              value={styleNumberText}
              onChange={(event) => setStyleNumberText(event.target.value)}
              className="h-[342px] w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-sm leading-6 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-100"
              placeholder="24324&#10;24501&#10;24548"
            />
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">商品资料</h2>
                <button
                  type="button"
                  onClick={selectWorkbooks}
                  className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  <FileSpreadsheet size={16} />
                  选择
                </button>
              </div>
              <div className="max-h-28 overflow-auto rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                {workbookPaths.length > 0
                  ? workbookPaths.map((filePath) => <div key={filePath}>{displayPath(filePath)}</div>)
                  : '未选择'}
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">输出目录</h2>
                <button
                  type="button"
                  onClick={selectOutputDir}
                  className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-50"
                >
                  <FolderOpen size={16} />
                  选择
                </button>
              </div>
              <div className="min-h-11 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                {outputDir || '未选择'}
              </div>
            </div>

            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {running ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              {running ? '处理中' : '开始处理'}
            </button>
          </aside>
        </section>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {workbookPath && (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <div className="min-w-0">
              <span className="font-semibold">已导出：</span>
              <span className="break-all">{workbookPath}</span>
            </div>
            <button
              type="button"
              onClick={() => window.zhongkongtai.showItemInFolder(workbookPath)}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
            >
              <ExternalLink size={16} />
              打开位置
            </button>
          </section>
        )}

        {rows.length > 0 && (
          <section className="rounded-md border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold">处理结果</h2>
              <div className="flex gap-2 text-xs">
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">成功 {stats.success}</span>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">提示 {stats.warning}</span>
                <span className="rounded-md bg-red-50 px-2 py-1 text-red-700">异常 {stats.error}</span>
              </div>
            </div>
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="w-48 px-4 py-3 font-semibold">款号</th>
                    <th className="w-32 px-4 py-3 font-semibold">状态</th>
                    <th className="px-4 py-3 font-semibold">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const meta = statusMeta[row.status];
                    const StatusIcon = meta.icon;

                    return (
                      <tr key={row.styleNumber} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-mono text-slate-900">{row.styleNumber}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${meta.className}`}>
                            <StatusIcon size={14} />
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.reason || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
