import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  DollarSign,
  Wallet,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  ArrowRight,
  Sliders,
  Sparkles,
  Target,
  TrendingUp,
  RefreshCw,
  X,
} from 'lucide-react';

const STATUS_STAGES = [
  { key: 'pending', label: 'Pending', badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
  { key: 'po_issued', label: 'PO Issued', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  { key: 'invoiced', label: 'Invoiced', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { key: 'paid', label: 'Paid', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
];

const EXPENSE_CATEGORIES = ['Food & Coffee', 'Transit / Beep', 'Bills & Load', 'Shopping', 'Personal', 'Other'];

const fmtUSD = (val) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(val || 0));

const fmtPHP = (val) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(val || 0));

const fmtHours = (mins) => {
  const totalSeconds = Math.round(Number(mins || 0) * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}h ${m}m ${s}s (${(totalSeconds / 3600).toFixed(2)} hrs)`;
};

const todayISO = () => new Date().toISOString().split('T')[0];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'payouts' | 'funds'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncingFx, setSyncingFx] = useState(false);

  // Server state
  const [settings, setSettings] = useState({
    daily_hour_cap: 8,
    weekly_hour_cap: 20,
    biweekly_hour_cap: 40,
    usd_to_php_rate: 63.5,
  });
  const [projects, setProjects] = useState([]);
  const [logs, setLogs] = useState([]);
  const [batches, setBatches] = useState([]);
  const [goals, setGoals] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Quick-Log Form State
  const [projectName, setProjectName] = useState('Project Cursa');
  const [queueNotes, setQueueNotes] = useState('');
  const [workDate, setWorkDate] = useState(todayISO());
  const [entryMode, setEntryMode] = useState('duration'); // 'time_range' | 'duration'
  const [startTime, setStartTime] = useState('09:00:00');
  const [endTime, setEndTime] = useState('11:00:00');
  const [durHours, setDurHours] = useState('1');
  const [durMins, setDurMins] = useState('30');
  const [durSecs, setDurSecs] = useState('0');
  const [taskCount, setTaskCount] = useState('25');
  const [payType, setPayType] = useState('hourly'); // 'hourly' | 'per_task'
  const [rateUsd, setRateUsd] = useState('5.00');
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [submittingLog, setSubmittingLog] = useState(false);

  // Add Work Preset Inline Drawer State
  const [showAddWork, setShowAddWork] = useState(false);
  const [newWorkName, setNewWorkName] = useState('');
  const [newWorkPayType, setNewWorkPayType] = useState('hourly');
  const [newWorkRate, setNewWorkRate] = useState('5.00');

  // Batching & Payout Modals
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [batchLabel, setBatchLabel] = useState('');
  const [payingBatch, setPayingBatch] = useState(null);
  const [confirmPhp, setConfirmPhp] = useState('');
  const [confirmFx, setConfirmFx] = useState('');

  // Settings Modal
  const [showSettings, setShowSettings] = useState(false);
  const [editSettings, setEditSettings] = useState(settings);

  // Funds & Goals Forms
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [txType, setTxType] = useState('expense'); // 'expense' | 'goal_deposit'
  const [txCategory, setTxCategory] = useState('Food & Coffee');
  const [txNote, setTxNote] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txGoalId, setTxGoalId] = useState('');
  const [txDate, setTxDate] = useState(todayISO());

  const loadBootstrap = async () => {
    try {
      setError('');
      const res = await fetch('/api/bootstrap');
      if (!res.ok) throw new Error('Backend not reachable');
      const data = await res.json();
      setSettings(data.settings);
      setEditSettings(data.settings);
      setProjects(data.projects || []);
      setLogs(data.logs || []);
      setBatches(data.batches || []);
      setGoals(data.goals || []);
      setTransactions(data.transactions || []);
      if (data.goals?.length && !txGoalId) {
        setTxGoalId(data.goals[0].id);
      }
    } catch (err) {
      setError('Cannot connect to Express server on port 5000. Make sure server/index.js is saved and running.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncLiveFx = async (silent = false) => {
    try {
      setSyncingFx(true);
      const res = await fetch('/api/fx/sync', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
          setEditSettings(data.settings);
        }
      }
    } catch (err) {
      if (!silent) setError('Could not sync live FX rate.');
    } finally {
      setSyncingFx(false);
    }
  };

  useEffect(() => {
    loadBootstrap().then(() => handleSyncLiveFx(true));
  }, []);

  // Computed Duration in Minutes (with second-level precision)
  const computedMinutes = useMemo(() => {
    if (entryMode === 'duration') {
      const totalSeconds =
        Number(durHours || 0) * 3600 +
        Number(durMins || 0) * 60 +
        Number(durSecs || 0);
      return Math.max(0, totalSeconds / 60);
    }
    if (!startTime || !endTime) return 0;
    const [sh = 0, sm = 0, ss = 0] = startTime.split(':').map(Number);
    const [eh = 0, em = 0, es = 0] = endTime.split(':').map(Number);
    let diffSeconds = eh * 3600 + em * 60 + es - (sh * 3600 + sm * 60 + ss);
    if (diffSeconds < 0) diffSeconds += 24 * 3600;
    return diffSeconds / 60;
  }, [entryMode, durHours, durMins, durSecs, startTime, endTime]);

  // Live Earnings Preview
  const previewEarnedUsd = useMemo(() => {
    const rate = Number(rateUsd || 0);
    if (payType === 'hourly') {
      return (computedMinutes / 60) * rate;
    }
    return Number(taskCount || 0) * rate;
  }, [payType, computedMinutes, taskCount, rateUsd]);

  const fxRate = Number(settings.usd_to_php_rate || 63.5);

  // Hour Cap Calculations
  const capMetrics = useMemo(() => {
    const now = new Date();
    const todayStr = todayISO();

    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMon);
    monday.setHours(0, 0, 0, 0);

    const twoWeeksAgo = new Date(monday);
    twoWeeksAgo.setDate(monday.getDate() - 7);

    let todayMins = 0;
    let weekMins = 0;
    let biweekMins = 0;

    logs.forEach((l) => {
      const logDateStr = String(l.work_date).split('T')[0];
      const d = new Date(`${logDateStr}T00:00:00`);
      const mins = Number(l.duration_minutes || 0);

      if (logDateStr === todayStr) todayMins += mins;
      if (d >= monday) weekMins += mins;
      if (d >= twoWeeksAgo) biweekMins += mins;
    });

    return {
      todayHours: todayMins / 60,
      weekHours: weekMins / 60,
      biweekHours: biweekMins / 60,
    };
  }, [logs]);

  // Financial Pipeline & PHP Ledger Metrics
  const financeMetrics = useMemo(() => {
    const unbatchedUsd = logs
      .filter((l) => !l.batch_id)
      .reduce((sum, l) => sum + Number(l.earned_usd || 0), 0);

    const inPipelineUsd = batches
      .filter((b) => b.status !== 'paid')
      .reduce((sum, b) => sum + Number(b.total_usd || 0), 0);

    const totalPaidPhp = batches
      .filter((b) => b.status === 'paid')
      .reduce((sum, b) => sum + Number(b.total_php || 0), 0);

    const totalExpensesPhp = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount_php || 0), 0);

    const totalGoalDepositsPhp = transactions
      .filter((t) => t.type === 'goal_deposit')
      .reduce((sum, t) => sum + Number(t.amount_php || 0), 0);

    const availablePhp = totalPaidPhp - totalExpensesPhp - totalGoalDepositsPhp;

    return {
      unbatchedUsd,
      inPipelineUsd,
      totalPendingUsd: unbatchedUsd + inPipelineUsd,
      totalPaidPhp,
      totalExpensesPhp,
      totalGoalDepositsPhp,
      availablePhp,
    };
  }, [logs, batches, transactions]);

  const unbatchedLogs = useMemo(() => logs.filter((l) => !l.batch_id), [logs]);

  // Handlers
  const handleSelectPreset = (proj) => {
    setProjectName(proj.name);
    setPayType(proj.default_pay_type);
    setRateUsd(Number(proj.default_rate).toFixed(2));
  };

  const handleAddWorkPreset = async (e) => {
    e.preventDefault();
    if (!newWorkName.trim()) return;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newWorkName,
        default_pay_type: newWorkPayType,
        default_rate: Number(newWorkRate || 5),
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      setProjectName(saved.name);
      setPayType(saved.default_pay_type);
      setRateUsd(Number(saved.default_rate).toFixed(2));
      setNewWorkName('');
      setShowAddWork(false);
      await loadBootstrap();
    }
  };

  const handleDeleteWorkPreset = async (e, id) => {
    e.stopPropagation();
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    await loadBootstrap();
  };

  const handleAddLog = async (e) => {
    e.preventDefault();
    if (!projectName.trim() || computedMinutes <= 0) return;
    setSubmittingLog(true);
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: projectName,
          queue_notes: queueNotes,
          work_date: workDate,
          entry_mode: entryMode,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: computedMinutes,
          task_count: Number(taskCount || 0),
          pay_type: payType,
          rate_usd: Number(rateUsd),
          save_as_preset: saveAsPreset,
        }),
      });
      if (res.ok) {
        setQueueNotes('');
        setSaveAsPreset(false);
        await loadBootstrap();
      }
    } finally {
      setSubmittingLog(false);
    }
  };

  const handleDeleteLog = async (id) => {
    await fetch(`/api/logs/${id}`, { method: 'DELETE' });
    setSelectedLogIds((prev) => prev.filter((item) => item !== id));
    await loadBootstrap();
  };

  const handleCreateBatch = async (e) => {
    e.preventDefault();
    if (!selectedLogIds.length) return;
    const label = batchLabel.trim() || `Cycle Batch (${new Date().toLocaleDateString()})`;
    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label,
        logIds: selectedLogIds,
        applied_fx_rate: fxRate,
      }),
    });
    if (res.ok) {
      setSelectedLogIds([]);
      setBatchLabel('');
      await loadBootstrap();
    }
  };

  const handleAdvanceBatchStatus = async (batch, nextStatus) => {
    if (nextStatus === 'paid') {
      setPayingBatch(batch);
      setConfirmFx(String(batch.applied_fx_rate || fxRate));
      setConfirmPhp((Number(batch.total_usd) * Number(batch.applied_fx_rate || fxRate)).toFixed(2));
      return;
    }
    await fetch(`/api/batches/${batch.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadBootstrap();
  };

  const handleConfirmPaid = async (e) => {
    e.preventDefault();
    if (!payingBatch) return;
    await fetch(`/api/batches/${payingBatch.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'paid',
        applied_fx_rate: Number(confirmFx),
        total_php: Number(confirmPhp),
      }),
    });
    setPayingBatch(null);
    await loadBootstrap();
  };

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!goalTitle.trim() || !goalTarget) return;
    await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: goalTitle,
        target_php: Number(goalTarget),
      }),
    });
    setGoalTitle('');
    setGoalTarget('');
    await loadBootstrap();
  };

  const handleAddLedgerTx = async (e) => {
    e.preventDefault();
    if (!txAmount || Number(txAmount) <= 0) return;
    await fetch('/api/ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: txType,
        category: txType === 'goal_deposit' ? 'Savings Allocation' : txCategory,
        note: txNote,
        amount_php: Number(txAmount),
        goal_id: txType === 'goal_deposit' ? txGoalId : null,
        tx_date: txDate,
      }),
    });
    setTxNote('');
    setTxAmount('');
    await loadBootstrap();
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editSettings),
    });
    setShowSettings(false);
    await loadBootstrap();
  };

  return (
    <div className="min-h-screen pb-16">
      {/* Top Floating Frosted Navbar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070B14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-slate-950 shadow-lg shadow-emerald-500/20">
              <TrendingUp className="h-5 w-5 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white">
                Pulse<span className="text-emerald-400">Ledger</span>
              </h1>
              <p className="text-[11px] text-slate-400">Work, Time & Earnings Terminal</p>
            </div>
          </div>

          {/* 3-View Switcher */}
          <nav className="flex items-center rounded-xl border border-white/10 bg-slate-900/80 p-1">
            {[
              { id: 'dashboard', label: 'Command Desk', icon: Clock },
              { id: 'payouts', label: 'Payout Pipeline', icon: Layers, count: unbatchedLogs.length },
              { id: 'funds', label: 'PHP Fund Ledger', icon: Wallet },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'bg-emerald-500/20 text-emerald-300 shadow-inner ring-1 ring-emerald-400/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span className="rounded-full bg-cyan-500/25 px-1.5 py-0.2 text-[10px] font-mono-num text-cyan-300">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right FX Pill & Settings */}
          <div className="flex items-center gap-2">
            <div className="flex items-center overflow-hidden rounded-xl border border-white/10 bg-slate-900/70 text-xs">
              <button
                onClick={() => {
                  setEditSettings(settings);
                  setShowSettings(true);
                }}
                title="Edit FX rate or hour caps manually"
                className="flex items-center gap-2 px-3 py-1.5 text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                <span className="text-slate-400">FX:</span>
                <span className="font-mono-num font-semibold text-cyan-300">
                  $1 = ₱{Number(settings.usd_to_php_rate).toFixed(2)}
                </span>
                <Sliders className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => handleSyncLiveFx(false)}
                disabled={syncingFx}
                title="Fetch latest free USD → PHP market rate"
                className="border-l border-white/10 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {syncingFx ? 'Syncing...' : 'Live'}
              </button>
            </div>
            <button
              onClick={loadBootstrap}
              title="Refresh data"
              className="rounded-xl border border-white/10 bg-slate-900/70 p-2 text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* TOP KPI STRIP */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="This Week Hours"
            value={`${capMetrics.weekHours.toFixed(2)} hrs`}
            sub={`Cap: ${Number(settings.weekly_hour_cap).toFixed(0)} hrs (${Math.min(
              100,
              Math.round((capMetrics.weekHours / Number(settings.weekly_hour_cap || 20)) * 100)
            )}%)`}
            accent="emerald"
            icon={Clock}
          />
          <KpiCard
            title="Unpaid Earnings (USD)"
            value={fmtUSD(financeMetrics.totalPendingUsd)}
            sub={`≈ ${fmtPHP(financeMetrics.totalPendingUsd * fxRate)}`}
            accent="cyan"
            icon={DollarSign}
          />
          <KpiCard
            title="Available Cash (PHP)"
            value={fmtPHP(financeMetrics.availablePhp)}
            sub={`From ${fmtPHP(financeMetrics.totalPaidPhp)} paid out`}
            accent="indigo"
            icon={Wallet}
          />
          <KpiCard
            title="Saved in Goals"
            value={fmtPHP(financeMetrics.totalGoalDepositsPhp)}
            sub={`Total Spent: ${fmtPHP(financeMetrics.totalExpensesPhp)}`}
            accent="amber"
            icon={Target}
          />
        </section>

        {/* TAB 1: COMMAND DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 5 Cols: Quick-Log Terminal */}
            <div className="lg:col-span-5">
              <div className="glass-panel rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-white">Log Work Session</h2>
                  </div>
                  <input
                    type="date"
                    value={workDate}
                    onChange={(e) => setWorkDate(e.target.value)}
                    className="glass-input rounded-lg px-2.5 py-1 text-xs font-mono-num"
                  />
                </div>

                {/* Saved Work Presets + Add/Delete Controls */}
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {projects.map((p) => {
                      const isSelected = projectName.toLowerCase() === p.name.toLowerCase();
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPreset(p)}
                          className={`group flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                            isSelected
                              ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <span>{p.name}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteWorkPreset(e, p.id)}
                            title={`Delete ${p.name} preset`}
                            className="rounded p-0.5 text-slate-400 opacity-60 transition hover:bg-rose-500/20 hover:text-rose-300 hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setShowAddWork((prev) => !prev)}
                      className="flex items-center gap-1 rounded-lg border border-dashed border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Work</span>
                    </button>
                  </div>

                  {/* Inline Quick-Add Work Preset Form */}
                  {showAddWork && (
                    <form
                      onSubmit={handleAddWorkPreset}
                      className="mt-2.5 space-y-2 rounded-xl border border-cyan-500/30 bg-slate-950/80 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-cyan-300">
                          New Work Preset
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddWork(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input
                          type="text"
                          required
                          placeholder="Work name"
                          value={newWorkName}
                          onChange={(e) => setNewWorkName(e.target.value)}
                          className="glass-input rounded-lg px-2.5 py-1.5 text-xs"
                        />
                        <select
                          value={newWorkPayType}
                          onChange={(e) => setNewWorkPayType(e.target.value)}
                          className="glass-input rounded-lg px-2 py-1.5 text-xs"
                        >
                          <option value="hourly">Hourly ($/hr)</option>
                          <option value="per_task">Per Task</option>
                        </select>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          required
                          placeholder="Rate $"
                          value={newWorkRate}
                          onChange={(e) => setNewWorkRate(e.target.value)}
                          className="glass-input rounded-lg px-2.5 py-1.5 text-xs font-mono-num"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full rounded-lg bg-cyan-500/25 py-1.5 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-500/35"
                      >
                        Save Work Preset
                      </button>
                    </form>
                  )}
                </div>

                <form onSubmit={handleAddLog} className="space-y-4">
                  {/* Project Name & Queue Note */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-400">
                        Project / Queue Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Project Cursa"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-400">
                        Queue / Batch Note (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Queue 3198 / KPC"
                        value={queueNotes}
                        onChange={(e) => setQueueNotes(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                      />
                    </div>
                  </div>

                  {/* Time Entry Mode Switcher (With Seconds!) */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-[11px] font-medium text-slate-400">Time Input Mode</label>
                      <div className="flex rounded-lg border border-white/10 bg-slate-950/70 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setEntryMode('duration')}
                          className={`rounded-md px-2.5 py-0.5 transition ${
                            entryMode === 'duration'
                              ? 'bg-cyan-500/25 text-cyan-200 font-medium'
                              : 'text-slate-400'
                          }`}
                        >
                          Direct Duration
                        </button>
                        <button
                          type="button"
                          onClick={() => setEntryMode('time_range')}
                          className={`rounded-md px-2.5 py-0.5 transition ${
                            entryMode === 'time_range'
                              ? 'bg-cyan-500/25 text-cyan-200 font-medium'
                              : 'text-slate-400'
                          }`}
                        >
                          Start / End Time
                        </button>
                      </div>
                    </div>

                    {entryMode === 'duration' ? (
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="24"
                            value={durHours}
                            onChange={(e) => setDurHours(e.target.value)}
                            className="glass-input w-full rounded-xl px-3 py-2 pr-10 text-xs font-mono-num"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-2 text-[11px] text-slate-500">
                            hrs
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="599"
                            value={durMins}
                            onChange={(e) => setDurMins(e.target.value)}
                            className="glass-input w-full rounded-xl px-3 py-2 pr-11 text-xs font-mono-num"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-2 text-[11px] text-slate-500">
                            mins
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            value={durSecs}
                            onChange={(e) => setDurSecs(e.target.value)}
                            className="glass-input w-full rounded-xl px-3 py-2 pr-10 text-xs font-mono-num"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-2 text-[11px] text-slate-500">
                            secs
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="mb-1 block text-[10px] text-slate-500">
                            Start Time (HH:MM:SS)
                          </span>
                          <input
                            type="time"
                            step="1"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                          />
                        </div>
                        <div>
                          <span className="mb-1 block text-[10px] text-slate-500">
                            End Time (HH:MM:SS)
                          </span>
                          <input
                            type="time"
                            step="1"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                          />
                        </div>
                      </div>
                    )}
                    <p className="mt-1.5 text-[11px] font-mono-num text-cyan-300/90">
                      Calculated Time: {fmtHours(computedMinutes)}
                    </p>
                  </div>

                  {/* Pay Structure & Tasks */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-400">
                        Tasks Done
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={taskCount}
                        onChange={(e) => setTaskCount(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-400">
                        Pay Type
                      </label>
                      <select
                        value={payType}
                        onChange={(e) => setPayType(e.target.value)}
                        className="glass-input w-full rounded-xl px-2.5 py-2 text-xs"
                      >
                        <option value="hourly">Hourly ($/hr)</option>
                        <option value="per_task">Per Task ($/task)</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-400">
                        Rate (USD)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        required
                        value={rateUsd}
                        onChange={(e) => setRateUsd(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                      />
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={saveAsPreset}
                      onChange={(e) => setSaveAsPreset(e.target.checked)}
                      className="rounded border-white/20 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Save project & rate as quick-select preset</span>
                  </label>

                  {/* Live Payout Preview Box */}
                  <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <div>
                      <p className="text-[11px] text-emerald-300/80">Estimated Session Payout</p>
                      <p className="text-lg font-bold font-mono-num text-emerald-300">
                        +{fmtUSD(previewEarnedUsd)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-400">PHP Equivalent</p>
                      <p className="text-sm font-semibold font-mono-num text-white">
                        ≈ {fmtPHP(previewEarnedUsd * fxRate)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingLog || computedMinutes <= 0}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4 stroke-[2.5]" />
                    <span>{submittingLog ? 'Recording...' : 'Record Work Session'}</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Right 7 Cols: Hour Cap Bars + Activity Feed */}
            <div className="space-y-6 lg:col-span-7">
              {/* Hour Cap Gauges */}
              <div className="glass-panel rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Work Hour Caps & Limits</h2>
                  <span className="text-[11px] text-slate-400">Auto-resets every Monday</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <CapGauge
                    label="Daily Limit"
                    current={capMetrics.todayHours}
                    max={Number(settings.daily_hour_cap)}
                  />
                  <CapGauge
                    label="Weekly Limit"
                    current={capMetrics.weekHours}
                    max={Number(settings.weekly_hour_cap)}
                  />
                  <CapGauge
                    label="Bi-Weekly Limit"
                    current={capMetrics.biweekHours}
                    max={Number(settings.biweekly_hour_cap)}
                  />
                </div>
              </div>

              {/* Recent Work Logs Table */}
              <div className="glass-panel rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    Work Log History ({logs.length})
                  </h2>
                  {unbatchedLogs.length > 0 && (
                    <button
                      onClick={() => setActiveTab('payouts')}
                      className="flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                    >
                      <span>{unbatchedLogs.length} unbatched logs</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {loading ? (
                  <p className="py-8 text-center text-xs text-slate-400">Loading terminal...</p>
                ) : logs.length === 0 ? (
                  <p className="py-8 text-center text-xs text-slate-400">
                    No sessions logged yet. Record your first task block on the left!
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-[11px] text-slate-400">
                          <th className="pb-2.5 font-medium">Date</th>
                          <th className="pb-2.5 font-medium">Project / Queue</th>
                          <th className="pb-2.5 font-medium">Time & Tasks</th>
                          <th className="pb-2.5 font-medium">Rate</th>
                          <th className="pb-2.5 text-right font-medium">Earned</th>
                          <th className="pb-2.5 text-right font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {logs.map((log) => (
                          <tr key={log.id} className="group hover:bg-white/[0.03]">
                            <td className="py-3 font-mono-num text-slate-300">
                              {String(log.work_date).split('T')[0]}
                            </td>
                            <td className="py-3">
                              <div className="font-medium text-white">{log.project_name}</div>
                              {log.queue_notes && (
                                <div className="text-[11px] text-slate-400">{log.queue_notes}</div>
                              )}
                            </td>
                            <td className="py-3 font-mono-num text-slate-300">
                              <div>{(Number(log.duration_minutes) / 60).toFixed(2)} hrs</div>
                              <div className="text-[11px] text-slate-400">
                                {log.task_count} tasks
                              </div>
                            </td>
                            <td className="py-3 font-mono-num text-slate-400">
                              {fmtUSD(log.rate_usd)}
                              {log.pay_type === 'hourly' ? '/hr' : '/task'}
                            </td>
                            <td className="py-3 text-right font-mono-num">
                              <div className="font-semibold text-emerald-300">
                                {fmtUSD(log.earned_usd)}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {log.batch_id ? 'Batched' : 'Unbatched'}
                              </div>
                            </td>
                            <td className="py-3 text-right">
                              {!log.batch_id && (
                                <button
                                  onClick={() => handleDeleteLog(log.id)}
                                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-400"
                                  title="Delete log"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PAYOUT PIPELINE */}
        {activeTab === 'payouts' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Unbatched Logs Selector */}
            <div className="lg:col-span-5">
              <div className="glass-panel rounded-2xl p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">
                    Unbatched Logs ({unbatchedLogs.length})
                  </h2>
                  {unbatchedLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedLogIds(
                          selectedLogIds.length === unbatchedLogs.length
                            ? []
                            : unbatchedLogs.map((l) => l.id)
                        )
                      }
                      className="text-xs text-cyan-300 hover:underline"
                    >
                      {selectedLogIds.length === unbatchedLogs.length ? 'Clear All' : 'Select All'}
                    </button>
                  )}
                </div>

                {unbatchedLogs.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    All logged work has been grouped into payout cycles.
                  </p>
                ) : (
                  <>
                    <div className="mb-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {unbatchedLogs.map((log) => {
                        const checked = selectedLogIds.includes(log.id);
                        return (
                          <div
                            key={log.id}
                            className={`flex items-center justify-between rounded-xl border p-3 text-xs transition ${
                              checked
                                ? 'border-emerald-400/50 bg-emerald-500/15'
                                : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                            }`}
                          >
                            <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setSelectedLogIds((prev) =>
                                    prev.includes(log.id)
                                      ? prev.filter((id) => id !== log.id)
                                      : [...prev, log.id]
                                  )
                                }
                                className="rounded border-white/20 bg-slate-900 text-emerald-500"
                              />
                              <div>
                                <div className="font-medium text-white">{log.project_name}</div>
                                <div className="text-[11px] font-mono-num text-slate-400">
                                  {String(log.work_date).split('T')[0]} ·{' '}
                                  {(Number(log.duration_minutes) / 60).toFixed(2)}h
                                  {log.queue_notes ? ` · ${log.queue_notes}` : ''}
                                </div>
                              </div>
                            </label>

                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-semibold text-emerald-300">
                                {fmtUSD(log.earned_usd)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDeleteLog(log.id)}
                                title="Delete this record"
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <form onSubmit={handleCreateBatch} className="space-y-3 border-t border-white/10 pt-3">
                      <input
                        type="text"
                        placeholder="Batch label (e.g. Nov 10–16 PO Cycle)"
                        value={batchLabel}
                        onChange={(e) => setBatchLabel(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={!selectedLogIds.length}
                        className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-40"
                      >
                        Create Payout Batch ({selectedLogIds.length} logs ·{' '}
                        {fmtUSD(
                          unbatchedLogs
                            .filter((l) => selectedLogIds.includes(l.id))
                            .reduce((s, l) => s + Number(l.earned_usd), 0)
                        )}
                        )
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>

            {/* Payout Cycles Tracker */}
            <div className="space-y-4 lg:col-span-7">
              <h2 className="text-sm font-semibold text-white">
                Payout Cycles (Pending → PO Issued → Invoiced → Paid)
              </h2>

              {batches.length === 0 ? (
                <div className="glass-panel rounded-2xl p-8 text-center text-xs text-slate-400">
                  No payout batches yet. Select unbatched logs on the left to start tracking a PO cycle.
                </div>
              ) : (
                batches.map((batch) => {
                  const stageIdx = STATUS_STAGES.findIndex((s) => s.key === batch.status);
                  const nextStage = STATUS_STAGES[stageIdx + 1];
                  return (
                    <div key={batch.id} className="glass-panel rounded-2xl p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{batch.label}</h3>
                          <p className="text-[11px] font-mono-num text-slate-400">
                            FX Rate: ₱{Number(batch.applied_fx_rate).toFixed(2)} / $1
                          </p>
                        </div>
                        <div className="text-right font-mono-num">
                          <div className="text-base font-bold text-white">
                            {fmtUSD(batch.total_usd)}
                          </div>
                          <div className="text-xs font-semibold text-emerald-300">
                            {fmtPHP(batch.total_php)}
                          </div>
                        </div>
                      </div>

                      {/* 4-Stage Pipeline Pills */}
                      <div className="mb-4 grid grid-cols-4 gap-1.5">
                        {STATUS_STAGES.map((st, idx) => {
                          const reached = idx <= stageIdx;
                          return (
                            <div
                              key={st.key}
                              className={`rounded-lg border px-2 py-1.5 text-center text-[11px] font-medium ${
                                reached
                                  ? st.badge
                                  : 'border-white/5 bg-white/[0.02] text-slate-500'
                              }`}
                            >
                              {st.label}
                            </div>
                          );
                        })}
                      </div>

                      {nextStage ? (
                        <button
                          onClick={() => handleAdvanceBatchStatus(batch, nextStage.key)}
                          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>Mark as {nextStage.label}</span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-emerald-400">
                          ✓ Paid & credited to Available PHP Balance
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PHP FUND & SAVINGS LEDGER */}
        {activeTab === 'funds' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-5">
              <div className="glass-panel rounded-2xl p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">Record PHP Transaction</h2>
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setTxType('expense')}
                    className={`rounded-lg py-1.5 font-medium transition ${
                      txType === 'expense'
                        ? 'bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40'
                        : 'text-slate-400'
                    }`}
                  >
                    Log Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxType('goal_deposit')}
                    className={`rounded-lg py-1.5 font-medium transition ${
                      txType === 'goal_deposit'
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                        : 'text-slate-400'
                    }`}
                  >
                    Allocate to Goal
                  </button>
                </div>

                <form onSubmit={handleAddLedgerTx} className="space-y-3">
                  {txType === 'expense' ? (
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400">Category</label>
                      <select
                        value={txCategory}
                        onChange={(e) => setTxCategory(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400">Target Goal</label>
                      <select
                        value={txGoalId}
                        onChange={(e) => setTxGoalId(e.target.value)}
                        required
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                      >
                        <option value="">Select a savings goal...</option>
                        {goals.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title} ({fmtPHP(g.saved_php)} / {fmtPHP(g.target_php)})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400">Amount (PHP)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        required
                        placeholder="500.00"
                        value={txAmount}
                        onChange={(e) => setTxAmount(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-slate-400">Date</label>
                      <input
                        type="date"
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                        className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] text-slate-400">Note (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Grab / Beep reload / Coffee"
                      value={txNote}
                      onChange={(e) => setTxNote(e.target.value)}
                      className="glass-input w-full rounded-xl px-3 py-2 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950"
                  >
                    {txType === 'expense' ? 'Record Expense' : 'Transfer to Savings Goal'}
                  </button>
                </form>
              </div>

              {/* Create New Savings Goal */}
              <div className="glass-panel rounded-2xl p-5">
                <h2 className="mb-3 text-sm font-semibold text-white">New Savings Goal</h2>
                <form onSubmit={handleCreateGoal} className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Goal title (e.g. Emergency Fund)"
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    className="glass-input flex-1 rounded-xl px-3 py-2 text-xs"
                  />
                  <input
                    type="number"
                    required
                    min="100"
                    placeholder="Target ₱"
                    value={goalTarget}
                    onChange={(e) => setGoalTarget(e.target.value)}
                    className="glass-input w-28 rounded-xl px-3 py-2 text-xs font-mono-num"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-500/30"
                  >
                    Add
                  </button>
                </form>
              </div>
            </div>

            <div className="space-y-6 lg:col-span-7">
              <div className="glass-panel rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-semibold text-white">Savings Goals</h2>
                {goals.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    Create a savings goal on the left to start allocating funds from paid payouts.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {goals.map((g) => {
                      const pct = Math.min(
                        100,
                        Math.round((Number(g.saved_php) / Number(g.target_php || 1)) * 100)
                      );
                      return (
                        <div key={g.id} className="glass-card rounded-xl p-4">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold text-white">{g.title}</span>
                            <span className="font-mono-num text-xs text-cyan-300">{pct}%</span>
                          </div>
                          <div className="mb-2 font-mono-num text-xs text-slate-300">
                            {fmtPHP(g.saved_php)}{' '}
                            <span className="text-slate-500">/ {fmtPHP(g.target_php)}</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="glass-panel rounded-2xl p-5">
                <h2 className="mb-4 text-sm font-semibold text-white">
                  PHP Ledger History ({transactions.length})
                </h2>
                {transactions.length === 0 ? (
                  <p className="text-xs text-slate-400">No PHP expenses or allocations yet.</p>
                ) : (
                  <div className="space-y-2">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-medium text-white">{tx.category}</div>
                          <div className="text-[11px] text-slate-400">
                            {String(tx.tx_date).split('T')[0]}
                            {tx.note ? ` · ${tx.note}` : ''}
                          </div>
                        </div>
                        <span
                          className={`font-mono-num font-semibold ${
                            tx.type === 'expense' ? 'text-rose-400' : 'text-cyan-300'
                          }`}
                        >
                          -{fmtPHP(tx.amount_php)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: CONFIRM PAID & PHP RECEIVED */}
      {payingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Confirm Payout Received</h3>
              <button onClick={() => setPayingBatch(null)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-300">
              Enter the exact PHP amount that landed in your account for{' '}
              <span className="font-semibold text-white">{payingBatch.label}</span> (
              {fmtUSD(payingBatch.total_usd)}).
            </p>
            <form onSubmit={handleConfirmPaid} className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">Applied FX Rate</label>
                <input
                  type="number"
                  step="0.0001"
                  value={confirmFx}
                  onChange={(e) => {
                    setConfirmFx(e.target.value);
                    setConfirmPhp((Number(payingBatch.total_usd) * Number(e.target.value)).toFixed(2));
                  }}
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">
                  Final PHP Credited to Balance
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={confirmPhp}
                  onChange={(e) => setConfirmPhp(e.target.value)}
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
              >
                Mark Paid & Add to Available PHP
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SETTINGS */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Terminal Caps & FX Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSettings} className="space-y-3">
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Daily Cap (h)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editSettings.daily_hour_cap}
                    onChange={(e) =>
                      setEditSettings({ ...editSettings, daily_hour_cap: e.target.value })
                    }
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Weekly Cap (h)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editSettings.weekly_hour_cap}
                    onChange={(e) =>
                      setEditSettings({ ...editSettings, weekly_hour_cap: e.target.value })
                    }
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-400">Bi-Weekly (h)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={editSettings.biweekly_hour_cap}
                    onChange={(e) =>
                      setEditSettings({ ...editSettings, biweekly_hour_cap: e.target.value })
                    }
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-slate-400">
                  Default USD → PHP Exchange Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editSettings.usd_to_php_rate}
                  onChange={(e) =>
                    setEditSettings({ ...editSettings, usd_to_php_rate: e.target.value })
                  }
                  className="glass-input w-full rounded-xl px-3 py-2 text-xs font-mono-num"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-2.5 text-xs font-bold text-slate-950"
              >
                Save Configuration
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ title, value, sub, accent, icon: Icon }) {
  const colors = {
    emerald: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    cyan: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
    indigo: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/30',
    amber: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  };

  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <div className={`rounded-lg border p-1.5 ${colors[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="text-xl font-bold font-mono-num text-white">{value}</div>
      <div className="mt-1 text-[11px] font-mono-num text-slate-400">{sub}</div>
    </div>
  );
}

function CapGauge({ label, current, max }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(100, Math.round((current / safeMax) * 100));
  const barColor =
    pct >= 95
      ? 'from-rose-500 to-amber-500'
      : pct >= 75
      ? 'from-amber-400 to-yellow-300'
      : 'from-emerald-400 to-cyan-400';

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono-num font-semibold text-white">{pct}%</span>
      </div>
      <div className="mb-2 font-mono-num text-sm font-bold text-slate-100">
        {current.toFixed(2)} <span className="text-xs font-normal text-slate-500">/ {max}h</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}