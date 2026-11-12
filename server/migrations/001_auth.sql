CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  google_sub VARCHAR(64) NULL,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(120) NOT NULL DEFAULT '',
  picture VARCHAR(500) NOT NULL DEFAULT '',
  role ENUM('admin','member') NOT NULL DEFAULT 'member',
  disabled TINYINT(1) NOT NULL DEFAULT 0,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  otp_secret VARBINARY(128) NULL,
  otp_confirmed_at BIGINT NULL,
  otp_last_step BIGINT NOT NULL DEFAULT 0,
  otp_fail_count INT NOT NULL DEFAULT 0,
  otp_locked_until BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  last_login_at BIGINT NULL,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_sub (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE invites (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  role ENUM('admin','member') NOT NULL DEFAULT 'member',
  invited_by BIGINT UNSIGNED NULL,
  created_at BIGINT NOT NULL,
  accepted_at BIGINT NULL,
  UNIQUE KEY uq_invites_email (email),
  CONSTRAINT fk_invites_user FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE recovery_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at BIGINT NULL,
  KEY ix_recovery_user (user_id),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sessions (
  id CHAR(64) NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  otp_verified TINYINT(1) NOT NULL DEFAULT 0,
  csrf CHAR(43) NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(300) NOT NULL DEFAULT '',
  KEY ix_sessions_user (user_id),
  KEY ix_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  at BIGINT NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  actor_email VARCHAR(254) NOT NULL DEFAULT '',
  action VARCHAR(60) NOT NULL,
  target VARCHAR(254) NOT NULL DEFAULT '',
  detail VARCHAR(1000) NOT NULL DEFAULT '',
  ip VARCHAR(64) NOT NULL DEFAULT '',
  KEY ix_audit_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
