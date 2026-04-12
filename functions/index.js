const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

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
    let downloadLimit = null;

    // Plan Configuration Logic
    switch (planType) {
        case 'starter':
            days = 7;
            downloadLimit = 15;
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
                'Invalid planType provided. Must be start, pro, or premium.'
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

    // Include download limits exclusively for starter plans
    if (planType === 'starter') {
        planData.downloadLimit = downloadLimit;
        planData.downloadCount = 0; // Fresh count
    }

    try {
        // Securely merge changes onto the user document directly bypassing client
        await admin.firestore()
            .collection('users')
            .doc(userId)
            .set(planData, { merge: true });

        return { 
            success: true, 
            message: `Successfully activated ${planType} plan for user.` 
        };
    } catch (error) {
        console.error("Error setting user premium status:", error);
        throw new functions.https.HttpsError(
            'internal', 
            'An error occurred securely upgrading the user subscription.'
        );
    }
});

/**
 * Cloud Function to securely decrement starter plan downloads.
 */
exports.decrementDownload = functions.https.onCall(async (data, context) => {
    const userId = data.userId;

    if (!userId) {
        throw new functions.https.HttpsError(
            'invalid-argument', 
            'The function must be called with a valid userId.'
        );
    }

    const userRef = admin.firestore().collection('users').doc(userId);
    
    try {
        const result = await admin.firestore().runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            
            if (!userDoc.exists) {
                throw new functions.https.HttpsError('not-found', 'User not found.');
            }

            const data = userDoc.data();
            
            // 1. Core Premium Validation First
            const isPremium = data.premium === true;
            const expiresAt = data.expiresAt || 0;
            const isExpired = Date.now() > expiresAt;

            if (!isPremium || isExpired) {
                return { success: false, message: 'Access denied: Valid premium plan required.' };
            }

            let planType = data.planType || 'pro';
            
            // Pro and premium have unlimited downloads, so immediately return success
            if (planType !== 'starter') {
                return { success: true, message: 'Plan is unlimited.' };
            }

            // Must be starter plan
            const limit = data.downloadLimit !== undefined ? data.downloadLimit : 15;
            
            if (limit <= 0) {
                return { success: false, message: 'Download limit reached.' };
            }
            
            // Decrement
            transaction.update(userRef, {
                downloadLimit: limit - 1,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            
            return { success: true, message: 'Download allowed and deducted.' };
        });
        
        return result;
        
    } catch (error) {
        console.error("Error decrementing limits: ", error);
        throw new functions.https.HttpsError(
            'internal', 
            'An error occurred securely updating download limits.'
        );
    }
});
