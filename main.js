const { Plugin, PluginSettingTab, Setting, Notice } = require('obsidian');
const { exec } = require('child_process');

const DEFAULT_SETTINGS = {
	propertyRules: []
};

module.exports = class RunScriptOnPropertyEditPlugin extends Plugin {
	async onload() {
		await this.loadSettings();

		// Store previous property values for comparison
		this.previousPropertyValues = new Map();

		// Register event handler for metadata changes
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				this.handleMetadataChange(file);
			})
		);

		// Add settings tab
		this.addSettingTab(new PropertyScriptSettingTab(this.app, this));

		console.log('Run Script on Property Edit plugin loaded');
	}

	async handleMetadataChange(file) {
		const metadata = this.app.metadataCache.getFileCache(file);
		if (!metadata || !metadata.frontmatter) {
			return;
		}

		const currentProperties = metadata.frontmatter;
		const fileKey = file.path;
		const previousProperties = this.previousPropertyValues.get(fileKey) || {};

		// If this file path wasn't tracked before, it might be a newly moved file
		// Check all stored paths to see if we just processed this file elsewhere
		if (!this.previousPropertyValues.has(fileKey)) {
			const now = Date.now();
			// Check if any file with the same properties was just processed
			for (const [storedPath, storedProps] of this.previousPropertyValues.entries()) {
				// If properties match exactly, this is likely a moved file
				let allMatch = true;
				for (const rule of this.settings.propertyRules) {
					if (!rule.enabled) continue;
					if (currentProperties[rule.propertyName] !== storedProps[rule.propertyName]) {
						allMatch = false;
						break;
					}
				}
				if (allMatch) {
					// This is a moved file, store the new path but don't trigger scripts
					this.previousPropertyValues.set(fileKey, { ...currentProperties });
					this.previousPropertyValues.delete(storedPath);
					return;
				}
			}
		}

		// Check if properties actually changed (deep comparison)
		let hasChanges = false;
		for (const rule of this.settings.propertyRules) {
			if (!rule.enabled) continue;
			const propertyName = rule.propertyName;
			if (currentProperties[propertyName] !== previousProperties[propertyName]) {
				hasChanges = true;
				break;
			}
		}

		// Only process if there are actual changes
		if (!hasChanges) {
			return;
		}

		// Check each configured property rule
		for (const rule of this.settings.propertyRules) {
			if (!rule.enabled) continue;

			const propertyName = rule.propertyName;
			const currentValue = currentProperties[propertyName];
			const previousValue = previousProperties[propertyName];

			// Detect if property was edited
			if (currentValue !== undefined && currentValue !== previousValue) {
				this.runScript(rule, file, currentValue, previousValue);
			}
		}

		// Update stored values
		this.previousPropertyValues.set(fileKey, { ...currentProperties });
	}

	async runScript(rule, file, currentValue, previousValue) {
		const script = rule.scriptPath;
		if (!script) {
			new Notice('No script path configured for property: ' + rule.propertyName);
			return;
		}

		// Prepare environment variables for the script
		const env = {
			...process.env,
			PROPERTY_NAME: rule.propertyName,
			PROPERTY_VALUE: String(currentValue),
			PREVIOUS_VALUE: String(previousValue || ''),
			FILE_PATH: file.path,
			FILE_NAME: file.name,
			VAULT_PATH: this.app.vault.adapter.basePath
		};

		// Determine the command based on file extension
		let command = script;
		if (script.endsWith('.bat') || script.endsWith('.cmd')) {
			// For Windows batch files, use cmd.exe
			command = `cmd.exe /c "${script}"`;
		}

		// Execute the script
		exec(command, { env, cwd: this.app.vault.adapter.basePath }, (error, stdout, stderr) => {
			if (error) {
				console.error(`Script execution error: ${error}`);
				new Notice(`Script error: ${error.message}`);
				return;
			}
			if (stderr) {
				console.error(`Script stderr: ${stderr}`);
			}
			if (stdout) {
				console.log(`Script output: ${stdout}`);
				if (rule.showNotification) {
					new Notice(stdout.trim());
				}
			} else if (rule.showNotification) {
				new Notice(`Script executed for property: ${rule.propertyName}`);
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {
		console.log('Run Script on Property Edit plugin unloaded');
	}
};

class PropertyScriptSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Run Script on Property Edit Settings' });

		// Add new rule button
		new Setting(containerEl)
			.setName('Add new property rule')
			.setDesc('Add a new property to watch')
			.addButton(button => button
				.setButtonText('Add Rule')
				.setCta()
				.onClick(() => {
					this.plugin.settings.propertyRules.push({
						enabled: true,
						propertyName: '',
						scriptPath: '',
						showNotification: true
					});
					this.plugin.saveSettings();
					this.display();
				}));

		// Display each rule
		this.plugin.settings.propertyRules.forEach((rule, index) => {
			const ruleContainer = containerEl.createDiv('property-rule-container');
			ruleContainer.createEl('h3', { text: `Rule ${index + 1}` });

			new Setting(ruleContainer)
				.setName('Enabled')
				.setDesc('Enable or disable this rule')
				.addToggle(toggle => toggle
					.setValue(rule.enabled)
					.onChange(async (value) => {
						rule.enabled = value;
						await this.plugin.saveSettings();
					}));

			new Setting(ruleContainer)
				.setName('Property name')
				.setDesc('The frontmatter property to watch (e.g., "status", "tags")')
				.addText(text => text
					.setPlaceholder('property-name')
					.setValue(rule.propertyName)
					.onChange(async (value) => {
						rule.propertyName = value;
						await this.plugin.saveSettings();
					}));

			new Setting(ruleContainer)
				.setName('Script path')
				.setDesc('Full path to the script to run (e.g., "C:\\Scripts\\my-script.bat" or "/usr/local/bin/my-script.sh")')
				.addText(text => text
					.setPlaceholder('/path/to/script')
					.setValue(rule.scriptPath)
					.onChange(async (value) => {
						rule.scriptPath = value;
						await this.plugin.saveSettings();
					}));

			new Setting(ruleContainer)
				.setName('Show notification')
				.setDesc('Show a notification when the script is executed')
				.addToggle(toggle => toggle
					.setValue(rule.showNotification)
					.onChange(async (value) => {
						rule.showNotification = value;
						await this.plugin.saveSettings();
					}));

			new Setting(ruleContainer)
				.setName('Delete rule')
				.setDesc('Remove this property rule')
				.addButton(button => button
					.setButtonText('Delete')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.propertyRules.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					}));

			ruleContainer.createEl('hr');
		});

		// Add documentation section
		containerEl.createEl('h2', { text: 'Environment Variables' });
		const docText = containerEl.createEl('p', {
			text: 'The following environment variables are passed to your script:'
		});
		const envList = containerEl.createEl('ul');
		envList.createEl('li', { text: 'PROPERTY_NAME: Name of the edited property' });
		envList.createEl('li', { text: 'PROPERTY_VALUE: New value of the property' });
		envList.createEl('li', { text: 'PREVIOUS_VALUE: Previous value of the property' });
		envList.createEl('li', { text: 'FILE_PATH: Path to the file (relative to vault)' });
		envList.createEl('li', { text: 'FILE_NAME: Name of the file' });
		envList.createEl('li', { text: 'VAULT_PATH: Full path to the vault' });
	}
}
