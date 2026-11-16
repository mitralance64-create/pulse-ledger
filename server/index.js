import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Helper: Convert Prisma Decimal/BigInt cleanly for JSON responses
const serialize = (data) =>
  JSON.parse(
    JSON.stringify(data, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );

// 1. BOOTSTRAP ALL DATA
app.get('/api/bootstrap', async (req, res) => {
  try {
    let settings = await prisma.user_settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.user_settings.create({ data: { id: 1 } });
    }

    const [projects, logs, batches, goals, transactions] = await Promise.all([
      prisma.projects.findMany({ orderBy: { created_at: 'asc' } }),
      prisma.work_logs.findMany({ orderBy: [{ work_date: 'desc' }, { created_at: 'desc' }] }),
      prisma.payout_batches.findMany({ orderBy: { created_at: 'desc' } }),
      prisma.savings_goals.findMany({ orderBy: { created_at: 'asc' } }),
      prisma.ledger_transactions.findMany({ orderBy: [{ tx_date: 'desc' }, { created_at: 'desc' }] }),
    ]);

    res.json(serialize({ settings, projects, logs, batches, goals, transactions }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load workspace data' });
  }
});

// 2. UPDATE SETTINGS (Caps & FX Rate)
app.put('/api/settings', async (req, res) => {
  try {
    const { daily_hour_cap, weekly_hour_cap, biweekly_hour_cap, usd_to_php_rate } = req.body;
    const updated = await prisma.user_settings.update({
      where: { id: 1 },
      data: {
        daily_hour_cap: Number(daily_hour_cap),
        weekly_hour_cap: Number(weekly_hour_cap),
        biweekly_hour_cap: Number(biweekly_hour_cap),
        usd_to_php_rate: Number(usd_to_php_rate),
      },
    });
    res.json(serialize(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// 2B. CREATE & DELETE PROJECT / WORK PRESETS
app.post('/api/projects', async (req, res) => {
  try {
    const { name, default_pay_type, default_rate } = req.body;
    const trimmed = name.trim();
    const existing = await prisma.projects.findFirst({ where: { name: trimmed } });
    if (existing) {
      const updated = await prisma.projects.update({
        where: { id: existing.id },
        data: {
          default_pay_type: default_pay_type || 'hourly',
          default_rate: Number(default_rate || 5),
        },
      });
      return res.json(serialize(updated));
    }

    const created = await prisma.projects.create({
      data: {
        name: trimmed,
        default_pay_type: default_pay_type || 'hourly',
        default_rate: Number(default_rate || 5),
      },
    });
    res.status(201).json(serialize(created));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save work preset' });
  }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await prisma.projects.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete work preset' });
  }
});

// 2C. FETCH & SYNC LIVE USD -> PHP RATE (100% Free, No API Key Needed)
app.post('/api/fx/sync', async (req, res) => {
  try {
    let liveRate = null;
    let source = 'frankfurter.dev';

    // Primary free endpoint (no key, unlimited)
    try {
      const r1 = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=PHP');
      if (r1.ok) {
        const d1 = await r1.json();
        if (d1?.rates?.PHP) liveRate = Number(d1.rates.PHP);
      }
    } catch (_) {}

    // Secondary free fallback endpoint (no key)
    if (!liveRate) {
      source = 'open.er-api.com';
      const r2 = await fetch('https://open.er-api.com/v6/latest/USD');
      if (r2.ok) {
        const d2 = await r2.json();
        if (d2?.rates?.PHP) liveRate = Number(d2.rates.PHP);
      }
    }

    if (!liveRate) {
      return res.status(502).json({ error: 'Could not reach free FX providers' });
    }

    const updated = await prisma.user_settings.update({
      where: { id: 1 },
      data: { usd_to_php_rate: Number(liveRate.toFixed(4)) },
    });

    res.json(serialize({ settings: updated, source, rate: Number(liveRate.toFixed(4)) }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync live FX rate' });
  }
});

// 3. CREATE WORK LOG (Supports HH:MM or HH:MM:SS)
app.post('/api/logs', async (req, res) => {
  try {
    const {
      project_name,
      queue_notes,
      work_date,
      entry_mode,
      start_time,
      end_time,
      duration_minutes,
      task_count,
      pay_type,
      rate_usd,
      save_as_preset,
    } = req.body;

    const mins = Number(duration_minutes);
    const tasks = Number(task_count || 0);
    const rate = Number(rate_usd);

    const earned_usd =
      pay_type === 'hourly'
        ? Number(((mins / 60) * rate).toFixed(2))
        : Number((tasks * rate).toFixed(2));

    const toTimeDate = (timeStr) => {
      if (!timeStr) return null;
      const parts = timeStr.split(':');
      const hh = parts[0]?.padStart(2, '0') || '00';
      const mm = parts[1]?.padStart(2, '0') || '00';
      const ss = (parts[2] || '00').padStart(2, '0');
      return new Date(`1970-01-01T${hh}:${mm}:${ss}.000Z`);
    };

    const createdLog = await prisma.work_logs.create({
      data: {
        project_name: project_name.trim(),
        queue_notes: queue_notes?.trim() || null,
        work_date: new Date(work_date),
        entry_mode,
        start_time: entry_mode === 'time_range' ? toTimeDate(start_time) : null,
        end_time: entry_mode === 'time_range' ? toTimeDate(end_time) : null,
        duration_minutes: Number(mins.toFixed(2)),
        task_count: tasks,
        pay_type,
        rate_usd: rate,
        earned_usd,
      },
    });

    if (save_as_preset) {
      const existing = await prisma.projects.findFirst({
        where: { name: project_name.trim() },
      });
      if (!existing) {
        await prisma.projects.create({
          data: {
            name: project_name.trim(),
            default_pay_type: pay_type,
            default_rate: rate,
          },
        });
      }
    }

    res.status(201).json(serialize(createdLog));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create work log' });
  }
});

// 4. DELETE WORK LOG
app.delete('/api/logs/:id', async (req, res) => {
  try {
    await prisma.work_logs.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

// 5. CREATE PAYOUT BATCH FROM UNBATCHED LOGS
app.post('/api/batches', async (req, res) => {
  try {
    const { label, logIds, applied_fx_rate } = req.body;
    const logs = await prisma.work_logs.findMany({
      where: { id: { in: logIds } },
    });

    const total_usd = Number(
      logs.reduce((sum, l) => sum + Number(l.earned_usd), 0).toFixed(2)
    );
    const fx = Number(applied_fx_rate);
    const total_php = Number((total_usd * fx).toFixed(2));

    const batch = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.payout_batches.create({
        data: {
          label,
          status: 'pending',
          total_usd,
          applied_fx_rate: fx,
          total_php,
        },
      });

      await tx.work_logs.updateMany({
        where: { id: { in: logIds } },
        data: { batch_id: newBatch.id },
      });

      return newBatch;
    });

    res.status(201).json(serialize(batch));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create payout batch' });
  }
});

// 6. ADVANCE PAYOUT BATCH STATUS (Pending -> PO Issued -> Invoiced -> Paid)
app.patch('/api/batches/:id/status', async (req, res) => {
  try {
    const { status, total_php, applied_fx_rate } = req.body;
    const data = { status };

    if (status === 'paid') {
      data.paid_at = new Date();
      if (total_php !== undefined) data.total_php = Number(total_php);
      if (applied_fx_rate !== undefined) data.applied_fx_rate = Number(applied_fx_rate);
    }

    const updated = await prisma.payout_batches.update({
      where: { id: req.params.id },
      data,
    });

    res.json(serialize(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update batch status' });
  }
});

// 7. CREATE SAVINGS GOAL
app.post('/api/goals', async (req, res) => {
  try {
    const { title, target_php, accent_color } = req.body;
    const goal = await prisma.savings_goals.create({
      data: {
        title: title.trim(),
        target_php: Number(target_php),
        accent_color: accent_color || '#06B6D4',
      },
    });
    res.status(201).json(serialize(goal));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create savings goal' });
  }
});

// 8. LOG PHP EXPENSE OR SAVINGS GOAL ALLOCATION
app.post('/api/ledger', async (req, res) => {
  try {
    const { type, category, note, amount_php, goal_id, tx_date } = req.body;
    const amt = Number(amount_php);

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.ledger_transactions.create({
        data: {
          type,
          category,
          note: note?.trim() || null,
          amount_php: amt,
          goal_id: type === 'goal_deposit' ? goal_id : null,
          tx_date: new Date(tx_date),
        },
      });

      if (type === 'goal_deposit' && goal_id) {
        await tx.savings_goals.update({
          where: { id: goal_id },
          data: { saved_php: { increment: amt } },
        });
      }

      return entry;
    });

    res.status(201).json(serialize(result));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record ledger transaction' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;

