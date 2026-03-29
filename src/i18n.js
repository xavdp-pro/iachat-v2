import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      "login": {
        "title": "Welcome Back",
        "subtitle": "Sign in to continue",
        "email": "Email address",
        "emailPlaceholder": "you@example.com",
        "password": "Password",
        "passwordPlaceholder": "Your password",
        "submit": "Sign in",
        "invalidCredentials": "Invalid email or password",
        "language": "Language",
        "themeLight": "Light mode",
        "themeDark": "Dark mode",
        "showPassword": "Show password",
        "hidePassword": "Hide password",
        "footer": "IAChat · v1.0",
        "noAccount": "Don't have an account?",
        "contactAdmin": "Contact your administrator"
      },
      "chat": {
        "newProject": "New project",
        "projects": "Projects",
        "noProjectSelected": "Select or create a project",
        "noProjectSubtitle": "Your conversations will appear here",
        "discussions": "Conversations",
        "newDiscussion": "New chat",
        "defaultDiscussionTitle": "New conversation",
        "renameDiscussionTitle": "Rename conversation",
        "renameDiscussion": "Rename",
        "discussionTitleLabel": "Title",
        "discussionActions": "Conversation actions",
        "deleteDiscussionTitle": "Delete conversation",
        "deleteDiscussionMessage": "Delete \"{{title}}\"? All messages in this chat will be removed.",
        "pickDiscussion": "Choose a conversation or start a new one",
        "messagePlaceholder": "Message…",
        "emptyGreeting": "How can I help you today?",
        "projectNameLabel": "Name",
        "projectDescLabel": "Description",
        "createProjectSubmit": "Create project",
        "editProject": "Edit project",
        "renameProject": "Rename",
        "archiveProject": "Archive",
        "unarchiveProject": "Restore from archive",
        "deleteProjectTitle": "Delete project",
        "deleteProjectMessage": "Delete \"{{name}}\" and all its conversations? This cannot be undone.",
        "archivedProjects": "Archived",
        "projectActions": "Project actions",
        "you": "You",
        "logout": "Sign out",
        "admin": "Admin panel",
        "localeFr": "Français",
        "localeEn": "English",
        "localeEs": "Español",
        "openMenu": "Open menu",
        "closeMenu": "Close menu",
        "sendMessage": "Send message",
        "landingGreeting": "How can I help you today?",
        "landingNoProject": "Select or create a project to get started",
        "landingWithProject": "Type your message and press Enter",
        "landingProjectHint": "Select a project on the left to begin",
        "startFirstMessage": "Start the conversation…",
        "emptyDiscussionGreeting": "Start the conversation",
        "emptyDiscussionSub": "Send your first message below",
        "assistant": "Assistant",
        "attachFile": "Attach file",
        "startRecording": "Start voice input",
        "stopRecording": "Stop recording",
        "removeAttachment": "Remove attachment",
        "deleteMessageTitle": "Delete message",
        "deleteMessageConfirm": "Delete this message? This cannot be undone.",
        "edited": "edited"
      },
      "admin": {
        "title": "Administration",
        "userListTitle": "Users",
        "subtitle": "Manage users and access roles.",
        "backToChat": "Back to chat",
        "addUser": "Add user",
        "userCount": "{{count}} user(s)",
        "colName": "Name",
        "colEmail": "Email",
        "colRole": "Role",
        "colStatus": "Status",
        "colCreated": "Created",
        "colActions": "Actions",
        "modalNew": "New user",
        "modalEdit": "Edit user",
        "email": "Email",
        "name": "Display name",
        "password": "Password (leave blank to keep current)",
        "role": "Role",
        "accountState": "Account status",
        "roleUser": "User",
        "roleAdmin": "Administrator",
        "deleteTitle": "Delete user",
        "deleteMessage": "Permanently delete {{email}}? This cannot be undone.",
        "error": "Request failed",
        "anonymous": "Anonymous"
      },
      "common": {
        "cancel": "Cancel",
        "save": "Save",
        "delete": "Delete",
        "edit": "Edit",
        "close": "Close",
        "active": "Active",
        "inactive": "Inactive",
        "loading": "Loading..."
      }
    }
  },
  fr: {
    translation: {
      "login": {
        "title": "Bon retour",
        "subtitle": "Connectez-vous pour continuer",
        "email": "Adresse e-mail",
        "emailPlaceholder": "vous@exemple.com",
        "password": "Mot de passe",
        "passwordPlaceholder": "Votre mot de passe",
        "submit": "Se connecter",
        "invalidCredentials": "Identifiants incorrects",
        "language": "Langue",
        "themeLight": "Mode clair",
        "themeDark": "Mode sombre",
        "showPassword": "Afficher le mot de passe",
        "hidePassword": "Masquer le mot de passe",
        "footer": "IAChat · v1.0",
        "noAccount": "Pas de compte ?",
        "contactAdmin": "Contactez votre administrateur"
      },
      "chat": {
        "newProject": "Nouveau projet",
        "projects": "Projets",
        "noProjectSelected": "Sélectionnez ou créez un projet",
        "noProjectSubtitle": "Vos conversations s'afficheront ici",
        "discussions": "Conversations",
        "newDiscussion": "Nouvelle conversation",
        "defaultDiscussionTitle": "Nouvelle conversation",
        "renameDiscussionTitle": "Renommer la conversation",
        "renameDiscussion": "Renommer",
        "discussionTitleLabel": "Titre",
        "discussionActions": "Actions sur la conversation",
        "deleteDiscussionTitle": "Supprimer la conversation",
        "deleteDiscussionMessage": "Supprimer « {{title}} » ? Tous les messages seront effacés.",
        "pickDiscussion": "Choisissez une conversation ou créez-en une",
        "messagePlaceholder": "Envoyer un message…",
        "emptyGreeting": "Comment puis-je vous aider ?",
        "projectNameLabel": "Nom",
        "projectDescLabel": "Description",
        "createProjectSubmit": "Créer le projet",
        "editProject": "Modifier le projet",
        "renameProject": "Renommer",
        "archiveProject": "Archiver",
        "unarchiveProject": "Désarchiver",
        "deleteProjectTitle": "Supprimer le projet",
        "deleteProjectMessage": "Supprimer « {{name}} » et toutes ses conversations ? Irréversible.",
        "archivedProjects": "Archivés",
        "projectActions": "Actions du projet",
        "you": "Vous",
        "logout": "Déconnexion",
        "admin": "Administration",
        "localeFr": "Français",
        "localeEn": "English",
        "localeEs": "Español",
        "openMenu": "Ouvrir le menu",
        "closeMenu": "Fermer le menu",
        "sendMessage": "Envoyer le message",
        "landingGreeting": "Comment puis-je vous aider ?",
        "landingNoProject": "Sélectionnez ou créez un projet pour commencer",
        "landingWithProject": "Écrivez votre message et appuyez sur Entrée",
        "landingProjectHint": "Sélectionnez un projet à gauche pour commencer",
        "startFirstMessage": "Commencez la conversation…",
        "emptyDiscussionGreeting": "Commencez la conversation",
        "emptyDiscussionSub": "Envoyez votre premier message ci-dessous",
        "assistant": "Assistant",
        "attachFile": "Joindre un fichier",
        "startRecording": "Démarrer la dictée",
        "stopRecording": "Arrêter l'enregistrement",
        "removeAttachment": "Supprimer la pièce jointe",
        "deleteMessageTitle": "Supprimer le message",
        "deleteMessageConfirm": "Supprimer ce message ? Cette action est irréversible.",
        "edited": "modifié"
      },
      "admin": {
        "title": "Administration",
        "userListTitle": "Utilisateurs",
        "subtitle": "Gérez les comptes et les rôles d'accès.",
        "backToChat": "Retour au chat",
        "addUser": "Ajouter un utilisateur",
        "userCount": "{{count}} utilisateur(s)",
        "colName": "Nom",
        "colEmail": "E-mail",
        "colRole": "Rôle",
        "colStatus": "Statut",
        "colCreated": "Créé le",
        "colActions": "Actions",
        "modalNew": "Nouvel utilisateur",
        "modalEdit": "Modifier l'utilisateur",
        "email": "E-mail",
        "name": "Nom affiché",
        "password": "Mot de passe (vide = inchangé)",
        "role": "Rôle",
        "accountState": "État du compte",
        "roleUser": "Utilisateur",
        "roleAdmin": "Administrateur",
        "deleteTitle": "Supprimer l'utilisateur",
        "deleteMessage": "Supprimer définitivement {{email}} ? Cette action est irréversible.",
        "error": "Échec de la requête",
        "anonymous": "Anonyme"
      },
      "common": {
        "cancel": "Annuler",
        "save": "Enregistrer",
        "delete": "Supprimer",
        "edit": "Modifier",
        "close": "Fermer",
        "active": "Actif",
        "inactive": "Inactif",
        "loading": "Chargement..."
      }
    }
  },
  es: {
    translation: {
      "login": {
        "title": "Bienvenido de nuevo",
        "subtitle": "Inicie sesión para continuar",
        "email": "Correo electrónico",
        "emailPlaceholder": "usted@ejemplo.com",
        "password": "Contraseña",
        "passwordPlaceholder": "Su contraseña",
        "submit": "Iniciar sesión",
        "invalidCredentials": "Correo o contraseña incorrectos",
        "language": "Idioma",
        "themeLight": "Modo claro",
        "themeDark": "Modo oscuro",
        "showPassword": "Mostrar contraseña",
        "hidePassword": "Ocultar contraseña",
        "footer": "IAChat · v1.0",
        "noAccount": "¿No tienes una cuenta?",
        "contactAdmin": "Contacte a su administrador"
      },
      "chat": {
        "newProject": "Nuevo proyecto",
        "projects": "Proyectos",
        "noProjectSelected": "Seleccione o cree un proyecto",
        "noProjectSubtitle": "Sus conversaciones aparecerán aquí",
        "discussions": "Conversaciones",
        "newDiscussion": "Nueva conversación",
        "defaultDiscussionTitle": "Nueva conversación",
        "renameDiscussionTitle": "Renombrar conversación",
        "renameDiscussion": "Renombrar",
        "discussionTitleLabel": "Título",
        "discussionActions": "Acciones de la conversación",
        "deleteDiscussionTitle": "Eliminar conversación",
        "deleteDiscussionMessage": "¿Eliminar «{{title}}»? Se borrarán todos los mensajes.",
        "pickDiscussion": "Elija una conversación o cree una nueva",
        "messagePlaceholder": "Escriba un mensaje…",
        "emptyGreeting": "¿En qué puedo ayudarte?",
        "projectNameLabel": "Nombre",
        "projectDescLabel": "Descripción",
        "createProjectSubmit": "Crear proyecto",
        "editProject": "Editar proyecto",
        "renameProject": "Renombrar",
        "archiveProject": "Archivar",
        "unarchiveProject": "Desarchivar",
        "deleteProjectTitle": "Eliminar proyecto",
        "deleteProjectMessage": "¿Eliminar «{{name}}» y todas sus conversaciones? No se puede deshacer.",
        "archivedProjects": "Archivados",
        "projectActions": "Acciones del proyecto",
        "you": "Tú",
        "logout": "Cerrar sesión",
        "admin": "Panel de administración",
        "localeFr": "Français",
        "localeEn": "English",
        "localeEs": "Español",
        "openMenu": "Abrir menú",
        "closeMenu": "Cerrar menú",
        "sendMessage": "Enviar mensaje",
        "landingGreeting": "¿En qué puedo ayudarte?",
        "landingNoProject": "Seleccione o cree un proyecto para comenzar",
        "landingWithProject": "Escriba su mensaje y pulse Intro",
        "landingProjectHint": "Seleccione un proyecto a la izquierda para comenzar",
        "startFirstMessage": "Comience la conversación…",
        "emptyDiscussionGreeting": "Comience la conversación",
        "emptyDiscussionSub": "Envíe su primer mensaje a continuación",
        "assistant": "Asistente",
        "attachFile": "Adjuntar archivo",
        "startRecording": "Iniciar dictado",
        "stopRecording": "Detener grabación",
        "removeAttachment": "Eliminar archivo adjunto",
        "deleteMessageTitle": "Eliminar mensaje",
        "deleteMessageConfirm": "¿Eliminar este mensaje? Esta acción no se puede deshacer.",
        "edited": "editado"
      },
      "admin": {
        "title": "Administración",
        "userListTitle": "Usuarios",
        "subtitle": "Gestione usuarios y roles de acceso.",
        "backToChat": "Volver al chat",
        "addUser": "Añadir usuario",
        "userCount": "{{count}} usuario(s)",
        "colName": "Nombre",
        "colEmail": "Correo",
        "colRole": "Rol",
        "colStatus": "Estado",
        "colCreated": "Creado",
        "colActions": "Acciones",
        "modalNew": "Nuevo usuario",
        "modalEdit": "Editar usuario",
        "email": "Correo electrónico",
        "name": "Nombre visible",
        "password": "Contraseña (vacío = sin cambio)",
        "role": "Rol",
        "accountState": "Estado de la cuenta",
        "roleUser": "Usuario",
        "roleAdmin": "Administrador",
        "deleteTitle": "Eliminar usuario",
        "deleteMessage": "¿Eliminar permanentemente a {{email}}? No se puede deshacer.",
        "error": "Error en la solicitud",
        "anonymous": "Anónimo"
      },
      "common": {
        "cancel": "Cancelar",
        "save": "Guardar",
        "delete": "Eliminar",
        "edit": "Editar",
        "close": "Cerrar",
        "active": "Activo",
        "inactive": "Inactivo",
        "loading": "Cargando..."
      }
    }
  }
};

/** UI languages we ship (ISO 639-1). */
const SUPPORTED_LANGS = ['fr', 'en', 'es']

/**
 * Map navigator.language(s) to a supported code, or fallback.
 */
function languageFromNavigator() {
  if (typeof navigator === 'undefined') return 'en'
  const candidates = [...(navigator.languages || []), navigator.language].filter(Boolean)
  for (const tag of candidates) {
    const base = String(tag).split('-')[0].toLowerCase()
    if (SUPPORTED_LANGS.includes(base)) return base
  }
  return 'en'
}

/**
 * Prefer saved choice (localStorage), else browser, else English.
 */
function getInitialLanguage() {
  if (typeof localStorage === 'undefined') return languageFromNavigator()
  const saved = localStorage.getItem('lng')
  if (saved && SUPPORTED_LANGS.includes(saved)) return saved
  if (saved) localStorage.removeItem('lng')
  return languageFromNavigator()
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getInitialLanguage(),
    supportedLngs: SUPPORTED_LANGS,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  })

// Persist any language change (single place; keeps localStorage in sync with i18n)
i18n.on('languageChanged', (lng) => {
  if (typeof localStorage === 'undefined') return
  const base = String(lng).split('-')[0].toLowerCase()
  if (SUPPORTED_LANGS.includes(base)) localStorage.setItem('lng', base)
})

export default i18n
