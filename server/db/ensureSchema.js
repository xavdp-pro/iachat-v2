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
    // ── devis (quote headers) ─────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        deal_id         VARCHAR(50) DEFAULT NULL,
        company_id      VARCHAR(50) DEFAULT NULL,
        client_name     VARCHAR(255) DEFAULT NULL,
        name            VARCHAR(255) NOT NULL DEFAULT 'Nouveau devis',
        status          ENUM('draft','analysis','editing','generated','sent') NOT NULL DEFAULT 'draft',
        source_file     VARCHAR(255) DEFAULT NULL,
        analysis_json   JSON DEFAULT NULL,
        total_ht        DECIMAL(12,2) DEFAULT NULL,
        pdf_path        VARCHAR(500) DEFAULT NULL,
        hubspot_note_id VARCHAR(50) DEFAULT NULL,
        created_by      INT DEFAULT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_devis_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis table ready')

    // ── devis.validation_json (idempotent patch) ──────────────────────────
    const [validationCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis' AND COLUMN_NAME = 'validation_json'`
    )
    if (!validationCols.length) {
      await db.query('ALTER TABLE devis ADD COLUMN validation_json JSON DEFAULT NULL')
      console.log('✅ DB: devis.validation_json column added')
    }

    // ── devis.current_version_id (active version pointer) ────────────────
    const [currentVersionCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis' AND COLUMN_NAME = 'current_version_id'`
    )
    if (!currentVersionCols.length) {
      await db.query('ALTER TABLE devis ADD COLUMN current_version_id INT DEFAULT NULL AFTER validation_json')
      console.log('✅ DB: devis.current_version_id column added')
    }

    // ── devis_lines (individual quote line items) ───────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_lines (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        devis_id          INT NOT NULL,
        position          INT NOT NULL DEFAULT 0,
        line_section      ENUM('products','calculations','transport') NOT NULL DEFAULT 'products',
        designation       VARCHAR(500) DEFAULT NULL,
        localisation      VARCHAR(255) DEFAULT NULL,
        type_porte        VARCHAR(100) DEFAULT NULL,
        gamme             VARCHAR(50) DEFAULT NULL,
        vantail           VARCHAR(5) DEFAULT NULL,
        hauteur_mm        INT DEFAULT NULL,
        largeur_mm        INT DEFAULT NULL,
        prix_base_ht      DECIMAL(12,2) DEFAULT NULL,
        ref_base          VARCHAR(50) DEFAULT NULL,
        options_json      JSON DEFAULT NULL,
        serrure_ref       VARCHAR(255) DEFAULT NULL,
        serrure_prix      DECIMAL(12,2) DEFAULT NULL,
        ferme_porte_ref   VARCHAR(255) DEFAULT NULL,
        ferme_porte_prix  DECIMAL(12,2) DEFAULT NULL,
        equipements_json  JSON DEFAULT NULL,
        total_ligne_ht    DECIMAL(12,2) DEFAULT NULL,
        alertes_json      JSON DEFAULT NULL,
        docs_json         JSON DEFAULT NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_dl_devis FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_lines table ready')

    // ── devis_lines.line_section (idempotent patch) ─────────────────────
    const [lineSectionCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_lines' AND COLUMN_NAME = 'line_section'`
    )
    if (!lineSectionCols.length) {
      await db.query("ALTER TABLE devis_lines ADD COLUMN line_section ENUM('products','calculations','transport') NOT NULL DEFAULT 'products' AFTER position")
      console.log('✅ DB: devis_lines.line_section column added')
    }

    // ── devis_lines.localisation (idempotent patch) ─────────────────────
    const [localisationCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_lines' AND COLUMN_NAME = 'localisation'`
    )
    if (!localisationCols.length) {
      await db.query('ALTER TABLE devis_lines ADD COLUMN localisation VARCHAR(255) DEFAULT NULL AFTER designation')
      console.log('✅ DB: devis_lines.localisation column added')
    }

    // ── devis_lines.ref_base (idempotent patch) ─────────────────────────
    const [refBaseCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_lines' AND COLUMN_NAME = 'ref_base'`
    )
    if (!refBaseCols.length) {
      await db.query('ALTER TABLE devis_lines ADD COLUMN ref_base VARCHAR(50) DEFAULT NULL AFTER prix_base_ht')
      console.log('✅ DB: devis_lines.ref_base column added')
    }

    // ── devis_versions (tree-based quote versions) ───────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_versions (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        devis_id          INT NOT NULL,
        parent_version_id INT DEFAULT NULL,
        version_label     VARCHAR(50) NOT NULL,
        branch_label      VARCHAR(100) DEFAULT NULL,
        title             VARCHAR(255) DEFAULT NULL,
        status            ENUM('draft','editing','prepdf','checked','pdf_generated','sent_hubspot','archived') NOT NULL DEFAULT 'draft',
        snapshot_json     JSON DEFAULT NULL,
        total_ht          DECIMAL(12,2) DEFAULT NULL,
        pdf_path          VARCHAR(500) DEFAULT NULL,
        hubspot_note_id   VARCHAR(50) DEFAULT NULL,
        hubspot_file_id   VARCHAR(50) DEFAULT NULL,
        locked_at         DATETIME DEFAULT NULL,
        created_by        INT DEFAULT NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dv_devis (devis_id),
        INDEX idx_dv_parent (parent_version_id),
        CONSTRAINT fk_dv_devis FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE,
        CONSTRAINT fk_dv_parent FOREIGN KEY (parent_version_id) REFERENCES devis_versions(id) ON DELETE SET NULL,
        CONSTRAINT fk_dv_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_versions table ready')

    // ── devis_version_lines (snapshot/editable lines by version) ─────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_version_lines (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        version_id      INT NOT NULL,
        source_line_id  INT DEFAULT NULL,
        position        INT NOT NULL DEFAULT 0,
        line_section    ENUM('products','calculations','transport') NOT NULL DEFAULT 'products',
        grid_json       JSON NOT NULL,
        designation_pdf TEXT DEFAULT NULL,
        total_ligne_ht  DECIMAL(12,2) DEFAULT NULL,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dvl_version (version_id),
        CONSTRAINT fk_dvl_version FOREIGN KEY (version_id) REFERENCES devis_versions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_version_lines table ready')

    // ── devis_version_comments (comments/checkpoints timeline) ───────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_version_comments (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        version_id  INT NOT NULL,
        step_key    VARCHAR(50) DEFAULT NULL,
        kind        ENUM('comment','checkpoint','check','pdf','hubspot') NOT NULL DEFAULT 'comment',
        content     TEXT NOT NULL,
        meta_json   JSON DEFAULT NULL,
        created_by  INT DEFAULT NULL,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dvc_version (version_id),
        CONSTRAINT fk_dvc_version FOREIGN KEY (version_id) REFERENCES devis_versions(id) ON DELETE CASCADE,
        CONSTRAINT fk_dvc_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_version_comments table ready')

    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_ai_messages (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        devis_id    INT DEFAULT NULL,
        version_id  INT DEFAULT NULL,
        user_id     INT DEFAULT NULL,
        role        ENUM('user','assistant') NOT NULL,
        content     MEDIUMTEXT NOT NULL,
        images_json MEDIUMTEXT DEFAULT NULL,
        agent_slug  VARCHAR(100) DEFAULT NULL,
        shared      TINYINT(1) NOT NULL DEFAULT 1,
        created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        edited_at   DATETIME DEFAULT NULL,
        INDEX idx_dam_scope (devis_id, version_id, created_at),
        INDEX idx_dam_user (user_id),
        CONSTRAINT fk_dam_devis FOREIGN KEY (devis_id) REFERENCES devis(id) ON DELETE CASCADE,
        CONSTRAINT fk_dam_version FOREIGN KEY (version_id) REFERENCES devis_versions(id) ON DELETE CASCADE,
        CONSTRAINT fk_dam_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_ai_messages table ready')

    const [devisAiImageCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_ai_messages' AND COLUMN_NAME = 'images_json'`
    )
    if (!devisAiImageCols.length) {
      await db.query('ALTER TABLE devis_ai_messages ADD COLUMN images_json MEDIUMTEXT DEFAULT NULL AFTER content')
      console.log('✅ DB: devis_ai_messages.images_json column added')
    }

    // ── devis_rules (atomic operational rules, separate from experiences) ─
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_rules (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        rule_code    VARCHAR(20) DEFAULT NULL,
        title        VARCHAR(255) NOT NULL,
        content      TEXT NOT NULL,
        category     VARCHAR(100) DEFAULT NULL,
        severity     ENUM('info','warning','blocking') NOT NULL DEFAULT 'warning',
        source_type  ENUM('markdown','human','experience','pdf','xlsx') NOT NULL DEFAULT 'human',
        source_ref   VARCHAR(255) DEFAULT NULL,
        tags_json    JSON DEFAULT NULL,
        status       ENUM('draft','active','obsolete') NOT NULL DEFAULT 'draft',
        qdrant_id    VARCHAR(128) DEFAULT NULL,
        created_by   INT DEFAULT NULL,
        approved_by  INT DEFAULT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY idx_dr_rule_code (rule_code),
        INDEX idx_dr_status (status),
        INDEX idx_dr_category (category),
        CONSTRAINT fk_dr_created_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_dr_approved_user FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_rules table ready')

    const [ruleCodeCols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_rules' AND COLUMN_NAME = 'rule_code'`
    )
    if (!ruleCodeCols.length) {
      await db.query('ALTER TABLE devis_rules ADD COLUMN rule_code VARCHAR(20) DEFAULT NULL AFTER id')
      console.log('✅ DB: devis_rules.rule_code column added')
    }
    const [ruleCodeIndexes] = await db.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis_rules' AND INDEX_NAME = 'idx_dr_rule_code'`
    )
    if (!ruleCodeIndexes.length) {
      await db.query('CREATE UNIQUE INDEX idx_dr_rule_code ON devis_rules (rule_code)')
      console.log('✅ DB: devis_rules.rule_code index added')
    }

    // ── devis_rule_checks (persisted validation reports by version) ───────
    await db.query(`
      CREATE TABLE IF NOT EXISTS devis_rule_checks (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        version_id   INT NOT NULL,
        report_json  JSON NOT NULL,
        summary_json JSON DEFAULT NULL,
        created_by   INT DEFAULT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_drc_version (version_id),
        CONSTRAINT fk_drc_version FOREIGN KEY (version_id) REFERENCES devis_versions(id) ON DELETE CASCADE,
        CONSTRAINT fk_drc_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: devis_rule_checks table ready')

    // ── transport tariffs (editable price rules) ────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS transport_tariffs (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        label          VARCHAR(255) NOT NULL,
        zone           VARCHAR(100) DEFAULT NULL,
        canton_codes   TEXT DEFAULT NULL,
        covered_countries TEXT DEFAULT NULL,
        country        VARCHAR(100) DEFAULT NULL,
        postal_prefix  VARCHAR(20) DEFAULT NULL,
        min_weight_kg  DECIMAL(10,2) DEFAULT NULL,
        max_weight_kg  DECIMAL(10,2) DEFAULT NULL,
        max_length_mm  INT DEFAULT NULL,
        max_width_mm   INT DEFAULT NULL,
        max_height_mm  INT DEFAULT NULL,
        price_ht       DECIMAL(12,2) NOT NULL DEFAULT 0,
        currency       VARCHAR(3) NOT NULL DEFAULT 'EUR',
        active         TINYINT(1) NOT NULL DEFAULT 1,
        sort_order     INT NOT NULL DEFAULT 0,
        notes          TEXT DEFAULT NULL,
        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('✅ DB: transport_tariffs table ready')

    const transportExtraCols = [
      ['canton_codes', 'TEXT DEFAULT NULL AFTER zone'],
      ['covered_countries', 'TEXT DEFAULT NULL AFTER canton_codes'],
    ]
    for (const [columnName, definition] of transportExtraCols) {
      const [cols] = await db.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transport_tariffs' AND COLUMN_NAME = ?`,
        [columnName]
      )
      if (!cols.length) {
        await db.query(`ALTER TABLE transport_tariffs ADD COLUMN ${columnName} ${definition}`)
        console.log(`✅ DB: transport_tariffs.${columnName} column added`)
      }
    }

    const [transportCount] = await db.query('SELECT COUNT(*) AS count FROM transport_tariffs')
    if (Number(transportCount[0]?.count || 0) === 0) {
      const seedTransport = [
        ['Zone 1', 'Cantons Suisse proches', 'GE, VD, VS, FR, NE, JU, BE, SO', 'Aucun', 'CH', 294, 1],
        ['Zone 2', 'Cantons Suisse moyennement éloigné', 'BS, BL, AG, ZH, LU, ZG, NW, OW, UR, SZ, TI, GR', 'Aucun', 'CH', 383, 2],
        ['Zone 3', 'Cantons Suisse éloignés', 'SH, TG, SG, GL, AR, AI', 'Luxembourg, Belgique', 'CH', 458, 3],
        ['Zone 4', 'Pays européens proches', 'Aucun', 'Espagne, Portugal, Italie, Angleterre, Pays-Bas, Denmark, Allemagne, Autriche', null, 698, 4],
        ['Zone 5', 'Reste du monde', 'Aucun', 'Reste du monde hors pays ci-dessus', null, 1423, 5],
      ]
      await db.query(
        `INSERT INTO transport_tariffs
         (zone, label, canton_codes, covered_countries, country, price_ht, sort_order, active, currency, notes)
         VALUES ?`,
        [seedTransport.map(row => [...row, 1, 'EUR', 'Tarif valable de 1 à 50 vantaux ; au-delà, ajouter 1 tarif supplémentaire par tranche de 50 vantaux. Import initial depuis Tarifs transport.xlsx'])]
      )
      console.log('✅ DB: transport_tariffs seeded from Tarifs transport.xlsx')
    }

  } catch (err) {
    console.error('ensureDbSchema:', err.message)
    throw err
  }
}
