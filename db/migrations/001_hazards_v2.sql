-- Laajennetaan hazards-taulua moderointia ja vahvistusta varten
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS confirmed_count INT DEFAULT 0;
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS reported_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hazards ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unverified';
