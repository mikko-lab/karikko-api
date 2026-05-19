CREATE TABLE IF NOT EXISTS hazards (
  id SERIAL PRIMARY KEY,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  depth_cm INTEGER,
  note TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS hazards_location ON hazards (latitude, longitude);
