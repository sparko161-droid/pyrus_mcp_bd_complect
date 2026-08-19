export interface AdapterContracts {
    userInterface: UserInterfaceAdapter;
    agentRunner: AgentRunnerAdapter;
    environment: EnvironmentAdapter;
}

export interface UserInterfaceAdapter {
    /**
     * Ask the user a question and wait for a string response.
     */
    askQuestion(prompt: string): Promise<string>;

    /**
     * Show a message, progress, or report to the user.
     */
    showMessage(message: string): Promise<void>;

    /**
     * Wait for explicit user approval for a proposed plan or action.
     */
    requestApproval(planDescription: string): Promise<boolean>;
}

export interface AgentRunnerAdapter {
    /**
     * Invoke a specialized agent with a given prompt and context.
     * @param agentRole The role or ID of the agent (e.g. pyrus_spec_analyst)
     * @param context Additional context or task description
     */
    invokeAgent(agentRole: string, context: string): Promise<AgentResult>;
}

export interface AgentResult {
    status: 'success' | 'failure';
    output: string;
    artifactsCreated: string[];
}

export interface EnvironmentAdapter {
    /**
     * Run the preflight environment checks (e.g. `npm run env:check`).
     */
    checkEnvironment(): Promise<boolean>;

    /**
     * Pull latest changes and sync knowledge base (e.g. `npm run kb:sync`).
     */
    syncKnowledgeBase(): Promise<void>;

    /**
     * Scaffold a new form directory structure (e.g. `npm run new:form`).
     */
    scaffoldForm(client: string, formName: string): Promise<void>;
}
