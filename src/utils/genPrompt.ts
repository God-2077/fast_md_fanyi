export function genPromptTemplate(promptTemplate: string, sourceLanguage: string, targetLanguage: string): string {
    return promptTemplate.replace(/{sourceLanguage}/g, sourceLanguage).replace(/{targetLanguage}/g, targetLanguage);
}