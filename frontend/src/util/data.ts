interface Item {
  Name: string
}

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export const postUserPreferences = async (preferences: Item[], userToken: string) => {
  try {
    // userPreferences returns an updated array of how these preferences changed the availableFavorites
    const auth = `Bearer ${userToken}`;
    const response = await fetch(`${API_URL}/api/userPreferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(preferences),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    // Update sessionStorage with the new userPreferences
    sessionStorage.setItem("userPreferences", JSON.stringify(preferences));

    // Update sessionStorage with the new availableFavorites
    sessionStorage.setItem("availableFavorites", JSON.stringify(result));

  } catch (error) {
    console.error('Error posting userPreferences:', error);
  }
};

// Helper function to check if data was fetched today and retrieve it if available
const getStoredData = (keys: string[]) => {
  const today = new Date().toISOString().split("T")[0];
  const storedDate = sessionStorage.getItem("date");

  if (storedDate !== today) {
    return null;
  }

  console.log("Data already fetched today");

  // Check if all keys are present
  for (const key of keys) {
    if (!sessionStorage.getItem(key)) {
      return null;
    }
  }

  // If all keys are present, retrieve and parse their values
  return keys.reduce((acc, key) => {
    acc[key] = JSON.parse(sessionStorage.getItem(key) as string);
    return acc;
  }, {} as Record<string, any>);
};

// Helper function to fetch data and store it in sessionStorage
const fetchAndStoreData = async (endpoint: string, keys: string[], authToken?: string) => {
  const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
  const response = await fetch(endpoint, { headers });

  if (!response.ok) {
    console.error("Error fetching data:", response.statusText);
    throw new Error(`Failed to fetch data from ${endpoint}`);
  }

  const result = await response.json();
  const today = new Date().toISOString().split("T")[0];
  sessionStorage.setItem("date", today);

  keys.forEach((key) => {
    sessionStorage.setItem(key, JSON.stringify(result[key] || []));
  });

  return result;
};

// Main function for fetching all data
export const fetchAllData = async (userToken: string | null) => {
  try {
    const storedData = getStoredData(["allItems", "dailyItems", "availableFavorites", "userPreferences"]);
    if (storedData) return storedData;

    console.log("New day... fetching new data");
    return await fetchAndStoreData(`${API_URL}/api/allData`, ["allItems", "dailyItems", "availableFavorites", "userPreferences"], userToken || undefined);
  } catch (error) {
    console.error("Error fetching all data:", error);
  }
};

// Main function for fetching general (non-user-exclusive) data
export const fetchGeneralData = async () => {
  try {
    const storedData = getStoredData(["allItems", "dailyItems"]);
    if (storedData) return storedData;

    console.log("New day... fetching new data");
    return await fetchAndStoreData(`${API_URL}/api/generalData`, ["allItems", "dailyItems"]);
  } catch (error) {
    console.error("Error fetching general data:", error);
  }
};
