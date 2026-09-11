-- LWTMT Cloud Dashboard — PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(16) NOT NULL DEFAULT 'admin',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per uploaded survey (one BeagleBone START/STOP session)
CREATE TABLE IF NOT EXISTS surveys (
    id             SERIAL PRIMARY KEY,
    filename       VARCHAR(255) NOT NULL,
    station_code   VARCHAR(64),
    surveyor_name  VARCHAR(128),
    designation    VARCHAR(128),
    row_count      INTEGER NOT NULL DEFAULT 0,
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_surveys_station ON surveys (station_code);
CREATE INDEX IF NOT EXISTS idx_surveys_uploaded_at ON surveys (uploaded_at);

-- One row per CSV sample within a survey (the 4 sensor readings + reference info)
CREATE TABLE IF NOT EXISTS survey_records (
    id                SERIAL PRIMARY KEY,
    survey_id         INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    sample_no         INTEGER,
    recorded_at       TIMESTAMPTZ,
    name              TEXT,
    designation       TEXT,
    station_no        TEXT,
    station_code      VARCHAR(64),
    chainage          DOUBLE PRECISION,
    loop_line_siding  VARCHAR(64),
    turnout_no        VARCHAR(64),
    curve_no          VARCHAR(64),
    level_crossing_no VARCHAR(64),
    hectometer_post   VARCHAR(64),
    bridge_start      TEXT,
    bridge_end        TEXT,
    level_crossing_lc_in TEXT,
    level_crossing_lc_out TEXT,
    kilometer_post    TEXT,
    points_crossing   TEXT,
    curve_in          TEXT,
    curve_out         TEXT,
    ohe_mast_location TEXT,
    switch_expansion_joint TEXT,
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    distance          DOUBLE PRECISION,
    gauge             DOUBLE PRECISION,   -- sensor 1
    crosslevel        DOUBLE PRECISION,   -- sensor 2
    twist             DOUBLE PRECISION    -- sensor 3
);

-- Keep existing localhost and Render databases compatible with the current schema.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_records' AND column_name = 'cumulative_tilt'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'survey_records' AND column_name = 'twist'
        ) THEN
            ALTER TABLE survey_records RENAME COLUMN cumulative_tilt TO twist;
        ELSE
            UPDATE survey_records
            SET twist = COALESCE(twist, cumulative_tilt);
            ALTER TABLE survey_records DROP COLUMN cumulative_tilt;
        END IF;
    END IF;
END $$;

ALTER TABLE survey_records DROP COLUMN IF EXISTS absolute_tilt;
ALTER TABLE survey_records DROP COLUMN IF EXISTS track_feature;
ALTER TABLE survey_records DROP COLUMN IF EXISTS track_feature_location;
ALTER TABLE survey_records DROP COLUMN IF EXISTS reference_type;
ALTER TABLE survey_records DROP COLUMN IF EXISTS reference_point;
ALTER TABLE survey_records DROP COLUMN IF EXISTS destination;
ALTER TABLE survey_records DROP COLUMN IF EXISTS station;

ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS station_no TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS bridge_start TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS bridge_end TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS level_crossing_lc_in TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS level_crossing_lc_out TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS kilometer_post TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS points_crossing TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS curve_in TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS curve_out TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS ohe_mast_location TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS switch_expansion_joint TEXT;
ALTER TABLE survey_records ADD COLUMN IF NOT EXISTS crosslevel DOUBLE PRECISION;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_records' AND column_name = 'crossover'
    ) THEN
        UPDATE survey_records
        SET crosslevel = COALESCE(crosslevel, crossover)
        WHERE crosslevel IS NULL;
        ALTER TABLE survey_records DROP COLUMN crossover;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_records' AND column_name = 'level_crossing_in'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'survey_records' AND column_name = 'level_crossing_lc_in'
        ) THEN
            UPDATE survey_records
            SET level_crossing_lc_in = COALESCE(level_crossing_lc_in, level_crossing_in)
            WHERE level_crossing_lc_in IS NULL;
            ALTER TABLE survey_records DROP COLUMN level_crossing_in;
        ELSE
            ALTER TABLE survey_records RENAME COLUMN level_crossing_in TO level_crossing_lc_in;
        END IF;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'survey_records' AND column_name = 'level_crossing_out'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'survey_records' AND column_name = 'level_crossing_lc_out'
        ) THEN
            UPDATE survey_records
            SET level_crossing_lc_out = COALESCE(level_crossing_lc_out, level_crossing_out)
            WHERE level_crossing_lc_out IS NULL;
            ALTER TABLE survey_records DROP COLUMN level_crossing_out;
        ELSE
            ALTER TABLE survey_records RENAME COLUMN level_crossing_out TO level_crossing_lc_out;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_records_survey ON survey_records (survey_id);
CREATE INDEX IF NOT EXISTS idx_records_station ON survey_records (station_code);
CREATE INDEX IF NOT EXISTS idx_records_recorded_at ON survey_records (recorded_at);
CREATE INDEX IF NOT EXISTS idx_records_chainage ON survey_records (chainage);
