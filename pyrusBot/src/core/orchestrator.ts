import { AdapterContracts } from './adapters';

export class PyrusBotOrchestrator {
    private ui: AdapterContracts['userInterface'];
    private agentRunner: AdapterContracts['agentRunner'];
    private env: AdapterContracts['environment'];

    constructor(adapters: AdapterContracts) {
        this.ui = adapters.userInterface;
        this.agentRunner = adapters.agentRunner;
        this.env = adapters.environment;
    }

    /**
     * The main entry point for starting a new session or task.
     */
    async startSession(): Promise<void> {
        await this.ui.showMessage("Starting PyrusBot session...");

        // 1. Preflight
        const isEnvReady = await this.env.checkEnvironment();
        if (!isEnvReady) {
            await this.ui.showMessage("Environment check failed. Please run bootstrap.ps1.");
            return;
        }

        // 2. Sync KB
        await this.ui.showMessage("Syncing Knowledge Base...");
        await this.env.syncKnowledgeBase();

        // 3. Elicit Intent
        const intent = await this.ui.askQuestion("What would you like to do? (e.g., 'new form', 'reverse documentation', 'modify existing')");

        if (intent.toLowerCase().includes("new form")) {
            await this.handleNewFormWorkflow();
        } else if (intent.toLowerCase().includes("reverse")) {
            await this.handleReverseDocumentation();
        } else {
            await this.handleGeneralTask(intent);
        }

        // 4. Finalize
        await this.ui.showMessage("Task completed. Please review changes.");
    }

    private async handleNewFormWorkflow(): Promise<void> {
        const client = await this.ui.askQuestion("Enter client name:");
        const formName = await this.ui.askQuestion("Enter form name (in Russian):");

        await this.ui.showMessage(`Scaffolding new form ${formName} for ${client}...`);
        await this.env.scaffoldForm(client, formName);

        await this.ui.showMessage("Delegating to pyrus_spec_analyst to collect requirements...");
        const result = await this.agentRunner.invokeAgent('pyrus_spec_analyst', `Collect requirements for new form ${formName}`);
        
        if (result.status === 'success') {
            await this.ui.showMessage("Requirements collected successfully.");
        } else {
            await this.ui.showMessage(`Agent failed: ${result.output}`);
        }
    }

    private async handleReverseDocumentation(): Promise<void> {
        await this.ui.showMessage("Delegating to pyrus_reverse_documentarian...");
        await this.agentRunner.invokeAgent('pyrus_reverse_documentarian', "Reverse document existing solution");
    }

    private async handleGeneralTask(task: string): Promise<void> {
        await this.ui.showMessage(`Analyzing task: ${task}`);
        // Delegating based on intent could be more sophisticated here.
        await this.agentRunner.invokeAgent('pyrus_bot_developer', task);
    }
}
