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

PRODUCT DATA FIELDS:
- "diet": Array of dietary certifications (e.g., ["Végétarien", "Informed Choice"])
- "ingredients": Full ingredient list (may be HTML string with bold allergens)
- "nutrition_panel": Nutritional values table (HTML string)
- "product_details": Specific product details (HTML string, may contain dietary suitability)
- "badges": Visible dietary labels from product page
- "key_benefits": Key product benefits (French: "Avantages clés")
- "why_choose": Why to choose this product (French: "Pourquoi choisir")
- "usage": Suggested usage instructions (French: "Utilisation suggérée")

LANGUAGE NOTE:
- Product data may be in French or English. Interpret all fields regardless of language.
- Respond in the user's language (match their question language).

PRODUCT TYPE AWARENESS:
- Dietary fields only apply to CONSUMABLE products (food, supplements).
- For non-consumable products (clothing, accessories), these fields will be empty.

CONTEXT USAGE:
- **USER PROFILE**: Check "age", "weight_kg", "height_cm", and "gender" for personalized recommendations.
  - Use these to contextualize serving sizes, caloric needs, protein requirements and supplements needs.
  - Example: A 30-year-old male at 80kg needs ~1.6-2.2g protein/kg for muscle gain = 128-176g/day.
  - If profile data is missing, do NOT assume values. Say that you can't calculate exact needs as you don't have the weight/height.
- Use all the "User Profile preferences" (goals, training frequency, dietary style...etc) to frame answers.
- Pay attention to "Additional Context" in user profile for nuanced preferences.
- When answering, cite specific product facts from the provided data.
- **CRITICAL ANALYSIS**: Compare marketing claims vs. ingredients. Verify if the "Key Benefits" are actually supported by the nutrition panel.

TONE:
- **Direct, critical, and expert.** Be an opinionated advisor, not just a label reader.
- **Don't sugarcoat.** If a product has low protein density (<70%), hidden sugars, or useless fillers, point it out.
- **Active Guidance:**
  - If a product aligns: "Excellent choice. High protein ratio (X%) matches your muscle gain goal."
  - If it conflicts: "Warning: This product contains X which conflicts with your goal Y. I wouldn't recommend it."
- Be concise. Max 2-3 short paragraphs per response.
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

  // Create a copy of productData excluding description (too noisy/redundant)
  const { description, ...cleanProductData } = productData || {};

  // Construct context-rich system message
  const systemContext = `
${CHAT_SYSTEM_PROMPT}

USER PREFERENCES:
${JSON.stringify(userContext, null, 2)}

CURRENT PRODUCT DATA:
${productData ? JSON.stringify(cleanProductData, null, 2) : "No specific product loaded."}
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
