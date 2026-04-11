import db from './index.js'

/**
 * Idempotent schema patches (add columns / tables if missing).
 */
export async function ensureDbSchema() {
  try {
    // ── projects.archived ──────────────────────────────────────────────────
    const [archivedCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'projects' AND COLUMN_NAME = 'archived'`
    )
    if (!archivedCols.length) {
      await db.query(
        'ALTER TABLE projects ADD COLUMN archived TINYINT(1) NOT NULL DEFAULT 0'
      )
      console.log('✅ DB: projects.archived column added')
    }

    // ── messages.edited_at ────────────────────────────────────────────────
    const [editedCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'edited_at'`
    )
    if (!editedCols.length) {
      await db.query('ALTER TABLE messages ADD COLUMN edited_at DATETIME NULL DEFAULT NULL')
      console.log('✅ DB: messages.edited_at column added')
    }

    // ── message_attachments ────────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS message_attachments (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        message_id   INT NOT NULL,
        attach_type  ENUM('image','document') NOT NULL DEFAULT 'document',
        name         VARCHAR(255) NOT NULL,
        mime_type    VARCHAR(100),
        data         LONGTEXT,
        size         INT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_ma_message FOREIGN KEY (message_id)
          REFERENCES messages(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: message_attachments table ready')

    await db.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: app_settings table ready')

    await db.query(`
      CREATE TABLE IF NOT EXISTS ollama_models_cache (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(200) NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: ollama_models_cache table ready')

    await db.query(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id INT NOT NULL,
        user_id    INT NOT NULL,
        role       ENUM('admin','member') NOT NULL DEFAULT 'member',
        joined_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, user_id),
        CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: project_members table ready')

    // ── experiences (base de connaissances commerciaux) ───────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS experiences (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        title       VARCHAR(255) NOT NULL,
        content     TEXT NOT NULL,
        category    VARCHAR(100) DEFAULT NULL,
        status      ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        qdrant_id   INT DEFAULT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_exp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: experiences table ready')

    // ── documents (pipeline d'analyse documentaire) ───────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        filename     VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        mime_type    VARCHAR(100),
        file_size    INT DEFAULT 0,
        page_count   INT DEFAULT 1,
        status       ENUM('pending','processing','done','error') NOT NULL DEFAULT 'pending',
        summary      MEDIUMTEXT,
        error_msg    VARCHAR(500) DEFAULT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_doc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: documents table ready')

    await db.query(`
      CREATE TABLE IF NOT EXISTS document_pages (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        document_id   INT NOT NULL,
        page_number   INT NOT NULL,
        raw_text      MEDIUMTEXT,
        vision_result MEDIUMTEXT,
        qdrant_id     VARCHAR(128) DEFAULT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_dp_doc FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: document_pages table ready')
  } catch (err) {
    console.error('ensureDbSchema:', err.message)
    throw err
  }
}
