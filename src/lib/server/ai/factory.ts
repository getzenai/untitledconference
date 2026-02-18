import { config } from '../config';
import { AzureOpenAIProvider } from './azure-openai-provider';
import { MockProvider } from './mock-provider';
import type { AIProvider } from './types';

/**
 * Factory for creating AI providers based on configuration
 */
export class AIProviderFactory {
	static create(): AIProvider {
		const providerType = config.aiProvider;

		if (providerType === 'mock') {
			return new MockProvider();
		}

		if (providerType === 'azure') {
			return new AzureOpenAIProvider();
		}

		const hasAzureConfig =
			config.azureOpenaiApiKey && config.azureResourceName && config.azureOpenaiDeploymentName;

		if (hasAzureConfig) {
			return new AzureOpenAIProvider();
		}

		return new MockProvider();
	}

	/**
	 * Create a specific provider by type
	 * @param type The type of provider to create
	 * @returns An instance of the specified provider
	 */
	static createByType(type: 'azure' | 'mock'): AIProvider {
		switch (type) {
			case 'azure':
				return new AzureOpenAIProvider();
			case 'mock':
				return new MockProvider();
			default:
				throw new Error(`Unknown provider type: ${type}`);
		}
	}
}
