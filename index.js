const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
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

    // Plan Configuration Logic
    switch (planType) {
        case 'starter':
            days = 7;
            break;
        case 'pro':
            days = 30;
            break;
        case 'premium':
            days = 90;
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
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

exports.generateExperience = functions.https.onCall(async (data, context) => {
    const role = data.role;
    if (!role) {
        throw new functions.https.HttpsError('invalid-argument', 'Role is required');
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `Generate 5-6 strong resume bullet points for a ${role}. Make them ATS-friendly, action-oriented, and professional. Return ONLY the text, one point per line, with no markdown, no asterisks, and no bullet symbols.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text.split('\n').map(b => b.replace(/^[\*\-\•\s]+/, '').trim()).filter(b => b.length > 0);
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});

exports.generateSkills = functions.https.onCall(async (data, context) => {
    const role = data.role;
    if (!role) {
        throw new functions.https.HttpsError('invalid-argument', 'Role is required');
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `Suggest 15 relevant technical and soft skills for a ${role}. Return only comma-separated skills without any markdown or extra text.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text.split(',').map(s => s.trim().replace(/^[\*\-\•\s]+/, '')).filter(s => s.length > 0);
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});

exports.generateSummary = functions.https.onCall(async (data, context) => {
    const role = data.role;
    if (!role) {
        throw new functions.https.HttpsError('invalid-argument', 'Role is required');
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `Write a professional 3-4 line resume summary for a ${role}. Make it ATS-friendly and impactful. Do not use markdown or special formatting. Return plain text only.`;
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        return text.replace(/[\*\-\•#_]+/g, '').trim();
    } catch (error) {
        console.error("AI Error:", error);
        throw new functions.https.HttpsError('internal', 'AI generation failed');
    }
});
