const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');

// Removed @google/generative-ai SDK


// Initialize Firebase Admin
admin.initializeApp();

// Initialize Resend
// Note: Set your API key via: firebase functions:config:set resend.key="YOUR_API_KEY"
let resend;
try {
  const apiKey = functions.config().resend.key;
  resend = new Resend(apiKey);
} catch (error) {
  console.log("Resend not initialized yet during deploy");
}

/**
 * Cloud Function to securely activate premium subscription status.
 * This should ideally be called via a trusted server context like a Razorpay webhook,
 * or securely authenticated from the client.
 */
exports.activatePremium = functions.https.onCall(async (data, context) => {
    const userId = data.userId;
    const planType = data.planType;

    // Validate inputs
    if (!userId || !planType) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'The function must be called with a valid userId and planType.'
        );
    }

    let days = 0;

    let aiCredits = 0;

    // Plan Configuration Logic
    switch (planType) {
        case 'starter':
            days = 7;
            aiCredits = 5;
            break;
        case 'pro':
            days = 30;
            aiCredits = 15;
            break;
        case 'premium':
            days = 90;
            aiCredits = 30;
            break;
        default:
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Invalid planType provided. Must be starter, pro, or premium.'
            );
    }

    // Calculate expiry logic
    const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

    // Build the secure update object
    const planData = {
        premium: true,
        planType: planType,
        expiresAt: expiresAt,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        aiCredits: admin.firestore.FieldValue.increment(aiCredits)
    };

    try {
        // Securely merge changes onto the user document directly bypassing client
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .set(planData, { merge: true });

        // Retrieve User info for Email
        let email = '';
        let name = 'User';
        try {
            const userRecord = await admin.auth().getUser(userId);
            email = userRecord.email;
            name = userRecord.displayName || 'User';
        } catch (authError) {
            console.error("Could not fetch user details for email:", authError);
            // Non-blocking: continue without email if auth fails gracefully
        }

        // Send Email Notification if email is present
        if (email) {
            const dateObj = new Date(expiresAt);
            const formattedDate = dateObj.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });

            const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <div style="text-align: center; margin-bottom: 30px;">
                <img src="https://resumebuilder.techyforever.com/logo.png" alt="ResumeForge" style="max-height: 50px;">
              </div>
              <p>Hi ${name},</p>
              <p>Your plan has been successfully activated!</p>
              <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0 0 10px 0;"><strong>Plan:</strong> ${planType.toUpperCase()}</p>
                <p style="margin: 0;"><strong>Expires On:</strong> ${formattedDate}</p>
              </div>
              <p>You now have access to:</p>
              <ul style="list-style: none; padding-left: 0;">
                <li style="margin-bottom: 10px;">✔ Premium Templates</li>
                <li style="margin-bottom: 10px;">✔ Resume Downloads</li>
                <li style="margin-bottom: 10px;">✔ Full Features</li>
              </ul>
              <div style="text-align: center; margin: 40px 0;">
                <a href="https://resumebuilder.techyforever.com" style="background-color: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">Build Your Resume</a>
              </div>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              <p style="text-align: center; font-size: 13px; color: #6b7280;">Need help? Contact us at <a href="mailto:techyforeverofficial1@gmail.com" style="color: #6366f1;">techyforeverofficial1@gmail.com</a></p>
            </div>
            `;

            try {
                // To activate standard deployment, configure process.env.RESEND_API_KEY
                if (resend) {
                    await resend.emails.send({
                        from: 'ResumeForge <onboarding@resend.dev>',
                        to: email,
                        subject: 'Your ResumeForge Plan is Activated 🚀',
                        html: emailHtml
                    });
                    console.log(`Activation email sent successfully to ${email}`);
                }
            } catch (emailError) {
                console.error("Resend API error sending email:", emailError);
                // Non-blocking: We don't want the function to return an error to the client if email fails
            }
        }

        return {
            success: true,
            message: "Successfully activated " + planType + " plan for user."
        };
    } catch (error) {
        console.error("Error setting user premium status:", error);
        throw new functions.https.HttpsError(
            'internal',
            'An error occurred securely upgrading the user subscription.'
        );
    }
});

async function callGemini(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    // Node 18+ natively supports fetch
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ]
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

exports.generateExperience = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    const role = data.role;
    if (!role) {
        throw new functions.https.HttpsError('invalid-argument', 'Role is required');
    }

    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userDoc = await userRef.get();
    const currentCredits = userDoc.data()?.aiCredits || 0;

    if (currentCredits <= 0) {
        throw new functions.https.HttpsError('resource-exhausted', 'No credits left');
    }

    try {
        const prompt = `Generate 4-6 strong resume bullet points for a ${role}.

Rules:
- Each point must be ONE LINE only
- Keep it SHORT (8-14 words max)
- Use simple, clear language that sounds human-written, NOT AI-generated
- Start with strong action verbs
- Avoid over-explaining
- STRICTLY AVOID filler words like "comprehensive", "robust", "complex"
- Be clean, ATS-friendly, and easy to scan in 5-10 seconds
- Do NOT include any explanation, reasoning, or headings
- Do NOT include words like THOUGHT, Attempt, or Refinement
- Do NOT use bullet symbols, numbers, or markdown
- Return only plain text lines (one point per line)

If anything other than final bullet points is included, the output is invalid.`;
        const text = await callGemini(prompt);
        await userRef.update({ aiCredits: admin.firestore.FieldValue.increment(-1) });
        return text.split('\n').map(b => b.replace(/^[\*\-\•\s]+/, '').trim()).filter(b => b.length > 0);
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});

exports.generateSkills = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    const role = data.role;
    if (!role) {
        throw new functions.https.HttpsError('invalid-argument', 'Role is required');
    }

    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userDoc = await userRef.get();
    const currentCredits = userDoc.data()?.aiCredits || 0;

    if (currentCredits <= 0) {
        throw new functions.https.HttpsError('resource-exhausted', 'No credits left');
    }

    try {
        const prompt = `Suggest 15 relevant technical and soft skills for a ${role}.

Rules:
- Output only a comma-separated list
- Be ATS-friendly and professional
- Do NOT include any explanation, reasoning, or headings
- Do NOT include words like THOUGHT, Attempt, or Refinement
- Do NOT use bullet symbols, numbers, or markdown
- Return only plain text

If anything other than the comma-separated skills list is included, the output is invalid.`;
        const text = await callGemini(prompt);
        await userRef.update({ aiCredits: admin.firestore.FieldValue.increment(-1) });
        return text.split(',').map(s => s.trim().replace(/^[\*\-\•\s]+/, '')).filter(s => s.length > 0);
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});

exports.generateSummary = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }
    const role = data.role;
    if (!role) {
        throw new functions.https.HttpsError('invalid-argument', 'Role is required');
    }

    const userRef = admin.firestore().collection('users').doc(context.auth.uid);
    const userDoc = await userRef.get();
    const currentCredits = userDoc.data()?.aiCredits || 0;

    if (currentCredits <= 0) {
        throw new functions.https.HttpsError('resource-exhausted', 'No credits left');
    }

    try {
        const prompt = `Write a professional 3-4 line resume summary for a ${role}.

Rules:
- Provide a single continuous abstract
- Make it ATS-friendly and impactful
- Do NOT include any explanation, reasoning, or headings
- Do NOT include words like THOUGHT, Attempt, or Refinement
- Do NOT use markdown, numbers, asterisks, or special formatting
- Return only plain text

If anything other than the final summary is included, the output is invalid.`;
        const text = await callGemini(prompt);
        await userRef.update({ aiCredits: admin.firestore.FieldValue.increment(-1) });
        return text.replace(/[\*\-\•#_]+/g, '').trim();
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});
