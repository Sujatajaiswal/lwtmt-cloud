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
    reference_type    VARCHAR(64),
    reference_point   VARCHAR(64),
    station_code      VARCHAR(64),
    chainage          DOUBLE PRECISION,
    loop_line_siding  VARCHAR(64),
    turnout_no        VARCHAR(64),
    curve_no          VARCHAR(64),
    level_crossing_no VARCHAR(64),
    hectometer_post   VARCHAR(64),
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    distance          DOUBLE PRECISION,
    gauge             DOUBLE PRECISION,   -- sensor 1
    crossover         DOUBLE PRECISION,   -- sensor 2
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

CREATE INDEX IF NOT EXISTS idx_records_survey ON survey_records (survey_id);
CREATE INDEX IF NOT EXISTS idx_records_station ON survey_records (station_code);
CREATE INDEX IF NOT EXISTS idx_records_recorded_at ON survey_records (recorded_at);
CREATE INDEX IF NOT EXISTS idx_records_chainage ON survey_records (chainage);
