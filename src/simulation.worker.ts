// src/simulation.worker.ts
import { generateFID, generateSpectrum, generate2DSpectrum } from './simulation';

// यह इवेंट लिसनर UI थ्रेड (Context) से आने वाले भारी सिमुलेशन टास्क को सुनेगा
self.onmessage = (event: MessageEvent) => {
  const { type, params } = event.data;

  try {
    let result;

    // 1. पहचानें कि कौन सा भारी फंक्शन चलाना है
    if (type === 'GENERATE_FID') {
      result = generateFID(params);
    } 
    else if (type === 'GENERATE_SPECTRUM') {
      result = generateSpectrum(params);
    } 
    else if (type === 'GENERATE_2D') {
      // 2D सिमुलेशन के पैरामीटर्स को अलग-अलग पास करना होगा
      result = generate2DSpectrum(
        params.experiment,
        params.peaks,
        params.nF1,
        params.nF2
      );
    }

    // 2. जब लूप्स और भारी गणित पूरा हो जाए, तो रिजल्ट वापस मुख्य UI थ्रेड को भेजें
    self.postMessage({ type, success: true, data: result });
  } catch (error: any) {
    // अगर कोड में कोई खराबी या क्रैश आता है, तो UI को एरर रिपोर्ट करें
    self.postMessage({ type, success: false, error: error.message || String(error) });
  }
};
