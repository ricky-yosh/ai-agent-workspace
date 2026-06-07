use clap::{Parser, Subcommand};
use ai_agent_workspace_commands::{AppState, Command, CommandResult, execute};

#[derive(Parser)]
#[command(name = "aiaws", about = "AI Agent Workspace CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Manage sessions
    Session {
        #[command(subcommand)]
        action: SessionAction,
    },
    /// Manage layout templates
    Template {
        #[command(subcommand)]
        action: TemplateAction,
    },
    /// Manage workspace instances
    Workspace {
        #[command(subcommand)]
        action: WorkspaceAction,
    },
}

#[derive(Subcommand)]
enum SessionAction {
    /// Create a new session
    Create {
        /// Session name
        #[arg(long)]
        name: String,
        /// Working directory path
        #[arg(long)]
        dir: String,
    },
    /// List all sessions
    List,
    /// Rename a session
    Rename {
        /// Session ID
        #[arg(long)]
        id: String,
        /// New name
        #[arg(long)]
        new_name: String,
    },
    /// Delete a session
    Delete {
        /// Session ID
        #[arg(long)]
        id: String,
    },
    /// Open a session
    Open {
        /// Session ID
        #[arg(long)]
        id: String,
    },
    /// Close a session
    Close {
        /// Session ID
        #[arg(long)]
        id: String,
    },
}

#[derive(Subcommand)]
enum TemplateAction {
    /// List all templates
    List,
    /// Save a new template
    Save {
        /// Template name
        #[arg(long)]
        name: String,
        /// Layout tree as inline JSON
        #[arg(long)]
        tree: Option<String>,
        /// Path to a JSON file containing the layout tree
        #[arg(long)]
        tree_file: Option<String>,
    },
    /// Delete a template
    Delete {
        /// Template ID
        #[arg(long)]
        id: String,
    },
    /// Rename a template
    Rename {
        /// Template ID
        #[arg(long)]
        id: String,
        /// New name
        #[arg(long)]
        new_name: String,
    },
}

#[derive(Subcommand)]
enum WorkspaceAction {
    /// List workspaces for a session
    List {
        /// Session ID
        #[arg(long)]
        session_id: String,
    },
    /// Get the active workspace for a session
    GetActive {
        /// Session ID
        #[arg(long)]
        session_id: String,
    },
    /// Add a workspace to a session
    Add {
        /// Session ID
        #[arg(long)]
        session_id: String,
        /// Template ID
        #[arg(long)]
        template_id: String,
    },
    /// Remove a workspace from a session
    Remove {
        /// Session ID
        #[arg(long)]
        session_id: String,
        /// Workspace ID
        #[arg(long)]
        workspace_id: String,
    },
    /// Rename a workspace
    Rename {
        /// Session ID
        #[arg(long)]
        session_id: String,
        /// Workspace ID
        #[arg(long)]
        workspace_id: String,
        /// New name
        #[arg(long)]
        new_name: String,
    },
    /// Set the active workspace for a session
    SetActive {
        /// Session ID
        #[arg(long)]
        session_id: String,
        /// Workspace ID
        #[arg(long)]
        workspace_id: String,
    },
    /// Update a workspace's layout tree
    UpdateTree {
        /// Session ID
        #[arg(long)]
        session_id: String,
        /// Workspace ID
        #[arg(long)]
        workspace_id: String,
        /// Layout tree as inline JSON
        #[arg(long)]
        tree: Option<String>,
        /// Path to a JSON file containing the layout tree
        #[arg(long)]
        tree_file: Option<String>,
    },
    /// Reset a workspace to its template
    Reset {
        /// Session ID
        #[arg(long)]
        session_id: String,
        /// Workspace ID
        #[arg(long)]
        workspace_id: String,
    },
}

fn main() {
    let cli = Cli::parse();

    let state = AppState::new().unwrap_or_else(|e| {
        let err = ai_agent_workspace_commands::CommandError::internal(
            &format!("failed to initialize: {}", e),
        );
        eprintln!("{}", serde_json::to_string(&err).unwrap());
        std::process::exit(1);
    });

    let result = match cli.command {
        Commands::Session { action } => match action {
            SessionAction::Create { name, dir } => {
                execute(Command::SessionCreate { working_dir: dir, name }, &state)
            }
            SessionAction::List => execute(Command::SessionList, &state),
            SessionAction::Rename { id, new_name } => {
                execute(Command::SessionRename { session_id: id, new_name }, &state)
            }
            SessionAction::Delete { id } => {
                execute(Command::SessionDelete { session_id: id }, &state)
            }
            SessionAction::Open { id } => {
                execute(Command::SessionOpen { session_id: id }, &state)
            }
            SessionAction::Close { id } => {
                execute(Command::SessionClose { session_id: id }, &state)
            }
        },
        Commands::Template { action } => match action {
            TemplateAction::List => execute(Command::TemplateList, &state),
            TemplateAction::Save { name, tree, tree_file } => {
                let layout_tree = resolve_layout_tree(tree, tree_file).unwrap_or_else(|e| {
                    eprintln!("{}", e);
                    std::process::exit(1);
                });
                execute(Command::TemplateSave { name, tree: layout_tree }, &state)
            }
            TemplateAction::Delete { id } => {
                execute(Command::TemplateDelete { layout_id: id }, &state)
            }
            TemplateAction::Rename { id, new_name } => {
                execute(Command::TemplateRename { layout_id: id, new_name }, &state)
            }
        },
        Commands::Workspace { action } => match action {
            WorkspaceAction::List { session_id } => {
                execute(Command::WorkspaceList { session_id }, &state)
            }
            WorkspaceAction::GetActive { session_id } => {
                execute(Command::WorkspaceGetActive { session_id }, &state)
            }
            WorkspaceAction::Add { session_id, template_id } => {
                execute(Command::WorkspaceAdd { session_id, template_id }, &state)
            }
            WorkspaceAction::Remove { session_id, workspace_id } => {
                execute(Command::WorkspaceRemove { session_id, workspace_id }, &state)
            }
            WorkspaceAction::Rename { session_id, workspace_id, new_name } => {
                execute(Command::WorkspaceRename { session_id, workspace_id, new_name }, &state)
            }
            WorkspaceAction::SetActive { session_id, workspace_id } => {
                execute(Command::WorkspaceSetActive { session_id, workspace_id }, &state)
            }
            WorkspaceAction::UpdateTree { session_id, workspace_id, tree, tree_file } => {
                let layout_tree = resolve_layout_tree(tree, tree_file).unwrap_or_else(|e| {
                    eprintln!("{}", e);
                    std::process::exit(1);
                });
                execute(Command::WorkspaceUpdateTree { session_id, workspace_id, tree: layout_tree }, &state)
            }
            WorkspaceAction::Reset { session_id, workspace_id } => {
                execute(Command::WorkspaceReset { session_id, workspace_id }, &state)
            }
        },
    };

    match result {
        Ok(command_result) => {
            let json = match command_result {
                CommandResult::Session(s) => serde_json::to_string_pretty(&s).unwrap(),
                CommandResult::Sessions(v) => serde_json::to_string_pretty(&v).unwrap(),
                CommandResult::Layout(l) => serde_json::to_string_pretty(&l).unwrap(),
                CommandResult::Layouts(v) => serde_json::to_string_pretty(&v).unwrap(),
                CommandResult::Workspace(w) => serde_json::to_string_pretty(&w).unwrap(),
                CommandResult::Workspaces(v) => serde_json::to_string_pretty(&v).unwrap(),
                CommandResult::Unit(()) => "null".to_string(),
            };
            println!("{}", json);
        }
        Err(e) => {
            eprintln!("{}", serde_json::to_string(&e).unwrap());
            std::process::exit(1);
        }
    }
}

fn resolve_layout_tree(
    tree: Option<String>,
    tree_file: Option<String>,
) -> Result<ai_agent_workspace_core::LayoutTree, Box<dyn std::error::Error>> {
    match (tree, tree_file) {
        (Some(json), None) => {
            serde_json::from_str(&json).map_err(|e| format!("invalid tree JSON: {}", e).into())
        }
        (None, Some(path)) => {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("failed to read {}: {}", path, e))?;
            serde_json::from_str(&content)
                .map_err(|e| format!("invalid tree JSON in {}: {}", path, e).into())
        }
        (None, None) => Ok(ai_agent_workspace_core::LayoutStore::default_layout()),
        (Some(_), Some(_)) => Err("cannot use both --tree and --tree-file".into()),
    }
}
