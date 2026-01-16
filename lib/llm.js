/**
 * WhatFits LLM Module
 * Chat-first UX - OpenAI integration for conversational product Q&A
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4.1-mini-2025-04-14';

// Chat System Prompt - focused on product Q&A
const CHAT_SYSTEM_PROMPT = `You are "WhatFits Companion".
Your goal is to answer user questions about the specific product based ONLY on product data and their saved preferences.

STRICT SAFETY RULES:
1. NO Medical Advice. Refuse to treat, cure, or diagnose.
2. NO Dosage Prescriptions. Do not provide specific dosage recommendations.
3. NO Hallucinations. If data is missing, say "I don't see that listed on the product page."
4. NO External Knowledge. Stick to the provided product labels and user context.

CONTEXT USAGE:
- Use "User Preferences" (goals, avoidances, dietary style) to frame answers.
- Pay attention to "Additional Context" in user settings for nuanced preferences.
- When answering, cite specific product facts from the provided data.

TONE:
- Friendly, objective, educational.
- Be concise. Max 2-3 short paragraphs per response.
- If a product aligns with preferences, say "Based on the label, this matches your goal for X."
- If it conflicts, say "This may conflict with your preference to avoid X."
`;

/**
 * Chat with the product context
 */
export async function chatWithProduct(messageHistory, productData, previousProductData, userContext, apiKey) {
  if (!apiKey) return { role: 'assistant', content: 'Error: No API key configured. Please add your OpenAI API key in Settings.' };

  // Build previous product section if available
  const previousProductSection = previousProductData
    ? `\nPREVIOUS PRODUCT (for comparison):\n${JSON.stringify(previousProductData, null, 2)}\n`
    : '';

  // Construct context-rich system message
  const systemContext = `
${CHAT_SYSTEM_PROMPT}

USER PREFERENCES:
${JSON.stringify(userContext, null, 2)}

CURRENT PRODUCT DATA:
${productData ? JSON.stringify(productData, null, 2) : "No specific product loaded."}
${previousProductSection}
`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemContext },
          ...messageHistory
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    return { role: 'assistant', content: content || "I'm sorry, I couldn't generate a response." };

  } catch (err) {
    console.error('Chat API Error:', err);
    return { role: 'assistant', content: `Sorry, I'm having trouble connecting to the AI. ${err.message}` };
  }
}
