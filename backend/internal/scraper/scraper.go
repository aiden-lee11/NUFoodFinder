package scraper

import (
	"backend/internal/db"
	"backend/internal/models"
	"encoding/json"
	"fmt"
	"github.com/gocolly/colly"
	"log"
	"net/http"
	"strings"
)

type DiningHallScraper struct {
	Client *http.Client
	Config ScrapeConfig
}

type ScrapeConfig struct {
	Locations []models.Location
	SiteID    string
	BaseURL   string
}

var DefaultConfig = ScrapeConfig{
	Locations: []models.Location{
		{
			Name: "Allison",
			Hash: "5b33ae291178e909d807593d",
			Services: []models.Service{
				{TimeOfDay: "Breakfast", Hash: "66e1fc2de45d43074be3a0e5"},
				{TimeOfDay: "Lunch", Hash: "66e1fc2de45d43074be3a0fb"},
				{TimeOfDay: "Dinner", Hash: "66e1fc2de45d43074be3a111"},
			},
		},
		{
			Name: "Sargent",
			Hash: "5b33ae291178e909d807593e",
			Services: []models.Service{
				{TimeOfDay: "Breakfast", Hash: "66e97bac351d530685467360"},
				{TimeOfDay: "Lunch", Hash: "66e97bac351d53068546737e"},
				{TimeOfDay: "Dinner", Hash: "66e97bac351d53068546736f"},
			},
		},
		{
			Name: "Plex West",
			Hash: "5bae7de3f3eeb60c7d3854ba",
			Services: []models.Service{
				{TimeOfDay: "Breakfast", Hash: "66e99466351d5306ad498440"},
				{TimeOfDay: "Lunch", Hash: "66e99466351d5306ad498450"},
				{TimeOfDay: "Dinner", Hash: "66e99466351d5306ad49845b"},
			},
		},
		{
			Name: "Plex East",
			Hash: "5bae7ee9f3eeb60cb4f8f3af",
			Services: []models.Service{
				{TimeOfDay: "Lunch", Hash: "66e99466351d5306ad498467"},
				{TimeOfDay: "Dinner", Hash: "66e99466351d5306ad498461"},
			},
		},
		{
			Name: "Elder",
			Hash: "5d113c924198d409c34fdf5c",
			Services: []models.Service{
				{TimeOfDay: "Breakfast", Hash: "66e43426c625af07233bfef2"},
				{TimeOfDay: "Lunch", Hash: "66e43426c625af07233bff01"},
				{TimeOfDay: "Dinner", Hash: "66e85380351d5306adcbcbcd"},
			},
		},
	},
	SiteID:  "5acea5d8f3eeb60b08c5a50d",
	BaseURL: "https://api.dineoncampus.com/v1/location/",
}

// Maximum retries for failed visits
const MAX_RETRIES = 3

func (d *DiningHallScraper) ScrapeFood(date string) ([]db.DailyItem, []db.AllDataItem, error) {
	// Check if we need to rescrape the daily items
	// previousDate, err := db.ReturnDateOfDailyItems()
	// if err != nil && err != db.NoItemsInDB {
	// 	log.Printf("Error getting date of daily items: %v", err)
	// 	return nil, nil, err
	// }

	// if date != previousDate {
	// 	db.DeleteDailyItems()
	// }

	var dailyItems []db.DailyItem
	var allDataItems []db.AllDataItem

	for _, location := range d.Config.Locations {
		for _, service := range location.Services {
			c := colly.NewCollector()
			c.WithTransport(d.Client.Transport)

			url := fmt.Sprintf("%s/%s/periods/%s?platform=0&date=%s", d.Config.BaseURL, location.Hash, service.Hash, date)

			err := RetryRequest(url, MAX_RETRIES, func() error {
				dItems, aItems, err := visitDiningHall(c, url, location.Name, service.TimeOfDay)
				if err != nil {
					return err
				}

				dailyItems = append(dailyItems, dItems...)
				allDataItems = append(allDataItems, aItems...)

				return nil
			})

			if err != nil {
				log.Printf("All retries failed for URL: %s", url)
				return nil, nil, err
			}
		}
	}

	fmt.Println("Scraping successful")
	return dailyItems, allDataItems, nil
}

func (d *DiningHallScraper) ScrapeOperationHours(date string) error {
	c := colly.NewCollector()
	c.WithTransport(d.Client.Transport)

	url := fmt.Sprintf("%s/weekly_schedule/?site_id=%s&date=%s", d.Config.BaseURL, d.Config.SiteID, date)

	err := RetryRequest(url, MAX_RETRIES, func() error {
		return visitOperationHours(c, url)
	})

	if err != nil {
		log.Printf("All retries failed for URL: %s", url)
		return err
	}

	fmt.Println("Scraping and saving successful")
	return nil
}

func visitOperationHours(c *colly.Collector, url string) error {
	c.OnResponse(func(r *colly.Response) {
		var jsonResponse models.OperationHoursResponse
		err := json.Unmarshal(r.Body, &jsonResponse)
		if err != nil {
			log.Printf("Error unmarshalling JSON for operation hours: %v", err)
			return
		}

		locations := jsonResponse.Locations

		err = postOperationHours(locations)
		if err != nil {
			log.Printf("Error for operation hours: %v", err)
			return
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("Error for operation hours: %v", err)
	})

	err := c.Visit(url)
	if err != nil {
		log.Printf("Visit failed for URL %s: %v", url, err)
		return err
	}
	return nil
}

func visitDiningHall(c *colly.Collector, url, locationName, timeOfDay string) ([]db.DailyItem, []db.AllDataItem, error) {
	var dailyItems []db.DailyItem
	var allDataItems []db.AllDataItem

	c.OnRequest(func(r *colly.Request) {
		r.Ctx.Put("locationName", locationName)
	})

	c.OnResponse(func(r *colly.Response) {
		locName := r.Ctx.Get("locationName")
		var jsonResponse models.DiningHallResponse
		err := json.Unmarshal(r.Body, &jsonResponse)
		if err != nil {
			log.Printf("Error unmarshalling JSON for %s: %v", locName, err)
			return
		}

		menu := jsonResponse.Menu

		parsedDailyItems, parsedAllDataItems, err := parseItems(menu, locName, timeOfDay)
		if err != nil {
			log.Printf("Error posting items for %s: %v", locName, err)
			return
		}

		dailyItems = append(dailyItems, parsedDailyItems...)
		allDataItems = append(allDataItems, parsedAllDataItems...)
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("Error for %s: %v", locationName, err)
		return
	})

	err := c.Visit(url)
	if err != nil {
		log.Printf("Visit failed for URL %s: %v", url, err)
		return nil, nil, err
	}
	return dailyItems, allDataItems, nil
}

func parseItems(menu models.Menu, location, timeOfDay string) ([]db.DailyItem, []db.AllDataItem, error) {
	categories := menu.Periods.Categories
	date := menu.Date

	var dailyItems []db.DailyItem
	var allDataItems []db.AllDataItem

	for _, category := range categories {
		cleanedCategory := strings.ToLower(strings.TrimSpace(category.Name))
		if contains(IngredientCategories, cleanedCategory) {
			fmt.Println("Skipping category", cleanedCategory)
			continue
		}

		station_name := category.Name

		for _, item := range category.Items {
			cleanedItem := strings.ToLower(strings.TrimSpace(item.Name))

			if contains(Ingredients, cleanedItem) {
				continue
			}

			itemName := db.AllDataItem{Name: item.Name}
			allDataItems = append(allDataItems, itemName)
			// err := db.InsertAllDataItem(itemName)
			// if err != nil {
			// 	log.Printf("Error saving item %s: %v", item.Name, err)
			// }

			menuItem := db.DailyItem{
				Name:        item.Name,
				Description: item.Description,
				Date:        date,
				Location:    location,
				StationName: station_name,
				TimeOfDay:   timeOfDay,
			}

			dailyItems = append(dailyItems, menuItem)

			// err = db.InsertDailyItem(menuItem)
			// if err != nil {
			// 	log.Printf("Error saving item %s: %v", item.Name, err)
			// }
		}
	}

	return dailyItems, allDataItems, nil
}

func postOperationHours(locations []models.LocationOperationInfo) error {
	fmt.Printf("Posting operation hours for %d locations\n", len(locations))
	for _, location := range locations {
		fmt.Printf("Posting operation hours for %v", location)
	}
	return nil
}
