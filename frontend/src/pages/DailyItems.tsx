import React, { useState, useEffect } from 'react'
import { fetchAllData, fetchGeneralData, postUserPreferences } from '../util/data';
import Fuse from 'fuse.js';
import { Input } from '@headlessui/react';
import Preferences from '../components/preferences'
import LocationItemGrid from '../components/locationGrid'
import { useAuth } from '../context/AuthProvider';
import AuthPopup from '../components/AuthPopup';
import { getCurrentTimeOfDay } from '../util/helper';

interface DailyItem {
  Name: string;
  Description: string;
  Location: string;
  Date: string;
  TimeOfDay: string;
}

interface Item {
  Name: string;
}

const DailyItems: React.FC = () => {
  const locations = ["Elder", "Sargent", "Allison", "Plex East", "Plex West"];
  const timesOfDay = ["Breakfast", "Lunch", "Dinner"];
  const [dailyItems, setDailyItems] = useState<DailyItem[]>([]);
  const [favorites, setFavorites] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredItems, setFilteredItems] = useState<DailyItem[]>([]);
  const [visibleLocations, setVisibleLocations] = useState<string[]>(locations);
  const [visibleTimes, setVisibleTimes] = useState<string[]>(timesOfDay);
  const [showPreferences, setShowPreferences] = useState(false); // Toggle for preferences visibility
  const [showPopup, setShowPopup] = useState(false); // Popup visibility state

  const { authLoading, token } = useAuth();

  const fuse = new Fuse(dailyItems, { keys: ['Name'], threshold: 0.5 });

  useEffect(() => {
    if (searchQuery) {
      const result = fuse.search(searchQuery).map(({ item }) => item);
      setFilteredItems(result);
    } else {
      setFilteredItems(dailyItems);
    }
  }, [searchQuery, dailyItems]);

  const handleItemClick = (item: Item) => {
    if (!token) {
      setShowPopup(true); // Show popup if user is not authenticated
      return; // Exit function to prevent further execution
    }

    let tempPreferences = favorites;
    const formattedItemName = item.Name.toLowerCase().trim();
    if (favorites.some(i => i.Name.toLowerCase().trim() === formattedItemName)) {
      tempPreferences = favorites.filter(i => i.Name.toLowerCase().trim() !== formattedItemName);
    } else {
      tempPreferences = [...favorites, item];
    }
    setFavorites(tempPreferences);
    postUserPreferences(tempPreferences, token as string);
  };

  const toggleLocationVisibility = (location: string) => {
    setVisibleLocations(prev =>
      prev.includes(location) ? prev.filter(loc => loc !== location) : [...prev, location]
    );
  };

  const toggleTimeVisibility = (time: string) => {
    setVisibleTimes(prev =>
      prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time]
    );
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!authLoading && token) {
          const data = await fetchAllData(token);
          if (data) {
            setDailyItems(data.dailyItems);
            setFavorites(data.userPreferences.map((item: Item) => item));
          }
        } else if (!authLoading && !token) {
          const data = await fetchGeneralData();
          if (data) {
            setDailyItems(data.dailyItems);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, [authLoading, token]);

  useEffect(() => {
    // Set the current time of day as the only visible time, if no dining halls open -> set all visible
    const currentTime = getCurrentTimeOfDay();
    if (currentTime) {
      setVisibleTimes([getCurrentTimeOfDay()]);
    }
  }, []);

  return (
    <div className="p-6 min-h-screen bg-transparent">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
        Daily Items For Today
      </h1>

      {/* Preferences Toggle */}
      <button
        onClick={() => setShowPreferences(!showPreferences)}
        className="p-2 rounded-md mb-4 
             bg-white-100 text-black 
             dark:bg-black-700 dark:text-white 
             border border-gray-300 dark:border-gray-700
             transition-colors duration-200"
      >
        {showPreferences ? "Hide Preferences" : "Show Preferences"}
      </button>

      {/* Preferences Box */}
      {showPreferences && (Preferences({ showPreferences, locations, visibleLocations, toggleLocationVisibility, timesOfDay, visibleTimes, toggleTimeVisibility })
      )}

      {/* Search Input */}
      <Input
        type="text"
        placeholder="Search for an item..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="mb-4 w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:border-transparent 
        bg-gray-100 text-gray-900 border-gray-300 focus:ring-gray-500 
        dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:focus:ring-gray-400"
      />

      {/* LocationItem Grid */}
      <LocationItemGrid
        locations={locations}
        visibleLocations={visibleLocations}
        timesOfDay={timesOfDay}
        visibleTimes={visibleTimes}
        filteredItems={filteredItems}
        favorites={favorites}
        handleItemClick={handleItemClick}
      />

      {showPopup && (
        <AuthPopup
          onClose={() => setShowPopup(false)}
        />
      )}

    </div>
  );
};

export default DailyItems;

