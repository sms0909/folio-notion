CREATE TABLE workspaces (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  owner_id BIGINT UNSIGNED NOT NULL,
  rev BIGINT NOT NULL DEFAULT 0,
  last_push VARCHAR(64) NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT fk_workspaces_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE workspace_members (
  workspace_id VARCHAR(100) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('owner','admin','member','guest') NOT NULL DEFAULT 'member',
  prefs MEDIUMTEXT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  KEY ix_members_user (user_id),
  CONSTRAINT fk_members_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users ADD COLUMN current_workspace VARCHAR(100) NULL;

CREATE TABLE pages (
  workspace_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  parent_id VARCHAR(100) NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  type ENUM('document','home','database') NOT NULL DEFAULT 'document',
  title VARCHAR(500) NOT NULL DEFAULT '',
  icon VARCHAR(30) NOT NULL DEFAULT 'file',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (workspace_id, id),
  KEY ix_pages_parent (workspace_id, parent_id),
  CONSTRAINT fk_pages_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE blocks (
  workspace_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  owner_kind ENUM('page','row','tpl') NOT NULL,
  owner_id VARCHAR(100) NOT NULL,
  parent_id VARCHAR(100) NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  type VARCHAR(20) NOT NULL,
  text MEDIUMTEXT NOT NULL,
  data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  KEY ix_blocks_owner (workspace_id, owner_id, position),
  CONSTRAINT fk_blocks_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `databases` (
  workspace_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  CONSTRAINT fk_databases_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE db_properties (
  workspace_id VARCHAR(100) NOT NULL,
  db_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (workspace_id, db_id, id),
  CONSTRAINT fk_props_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE db_views (
  workspace_id VARCHAR(100) NOT NULL,
  db_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  data MEDIUMTEXT NOT NULL,
  PRIMARY KEY (workspace_id, db_id, id),
  CONSTRAINT fk_views_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE db_rows (
  workspace_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  db_id VARCHAR(100) NOT NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  title VARCHAR(500) NOT NULL DEFAULT '',
  `values` MEDIUMTEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  KEY ix_rows_db (workspace_id, db_id, position),
  CONSTRAINT fk_rows_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE templates (
  workspace_id VARCHAR(100) NOT NULL,
  id VARCHAR(100) NOT NULL,
  position DOUBLE NOT NULL DEFAULT 0,
  title VARCHAR(500) NOT NULL DEFAULT '',
  icon VARCHAR(30) NOT NULL DEFAULT 'file',
  PRIMARY KEY (workspace_id, id),
  CONSTRAINT fk_templates_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE page_versions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  page_id VARCHAR(100) NOT NULL,
  at BIGINT NOT NULL,
  author_id BIGINT UNSIGNED NULL,
  title VARCHAR(500) NOT NULL DEFAULT '',
  block_count INT NOT NULL DEFAULT 0,
  blocks LONGTEXT NOT NULL,
  KEY ix_versions_page (workspace_id, page_id, at),
  CONSTRAINT fk_versions_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_versions_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE files (
  id CHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  mime VARCHAR(100) NOT NULL,
  uploader_id BIGINT UNSIGNED NULL,
  created_at BIGINT NOT NULL,
  KEY ix_files_workspace (workspace_id, created_at),
  CONSTRAINT fk_files_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
