/**
 * Weather Analyzer Sub-Agent
 * Analyzes weather data for renewable energy forecasting
 */

import { SubAgent } from '../base.mjs';

export class WeatherAnalyzer extends SubAgent {
  constructor(config) {
    super({
      ...config,
      role: 'WEATHER_ANALYZER',
      interval: config.interval || 300000 // 5 minutes default
    });
    
    this.location = config.location || { lat: 38.9, lon: -80.2 }; // West Virginia
    this.analysesCompleted = 0;
    this.weatherHistory = [];
  }

  async performTask(parentContext) {
    const weather = this.fetchWeatherData();
    const renewableImpact = this.analyzeRenewableImpact(weather);
    
    this.weatherHistory.push({
      weather,
      renewableImpact,
      timestamp: Date.now()
    });
    
    // Keep only last 48 readings (4 hours)
    if (this.weatherHistory.length > 48) {
      this.weatherHistory.shift();
    }
    
    this.analysesCompleted++;
    
    return {
      location: this.location,
      weather,
      renewableImpact,
      forecast: this.generateForecast(),
      totalAnalyses: this.analysesCompleted,
      timestamp: Date.now()
    };
  }

  fetchWeatherData() {
    // Simulate weather data
    const conditions = ['clear', 'cloudy', 'rain', 'storm', 'snow'];
    const windDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const temperature = 15 + Math.random() * 25; // 15-40°C
    const windSpeed = Math.random() * 30; // 0-30 km/h
    const humidity = 40 + Math.random() * 60; // 40-100%
    const solarIrradiance = condition === 'clear' ? 800 + Math.random() * 400 : 
                           condition === 'cloudy' ? 200 + Math.random() * 300 : 
                           50 + Math.random() * 100;
    
    return {
      condition,
      temperature: temperature.toFixed(1),
      temperatureF: (temperature * 9/5 + 32).toFixed(1),
      windSpeed: windSpeed.toFixed(1),
      windDirection: windDirections[Math.floor(Math.random() * windDirections.length)],
      humidity: Math.round(humidity),
      solarIrradiance: Math.round(solarIrradiance),
      pressure: 990 + Math.random() * 40,
      timestamp: Date.now()
    };
  }

  analyzeRenewableImpact(weather) {
    const temp = parseFloat(weather.temperature);
    const wind = parseFloat(weather.windSpeed);
    const irradiance = weather.solarIrradiance;
    
    // Solar efficiency calculation
    const solarEfficiency = Math.max(0, Math.min(1, irradiance / 1000));
    const solarOutput = solarEfficiency * 150; // 150 MW capacity
    
    // Wind efficiency calculation
    const windEfficiency = wind > 5 && wind < 50 ? 
      Math.min(1, (wind - 5) / 20) : 0;
    const windOutput = windEfficiency * 800; // 800 MW capacity
    
    // Hydro is less weather dependent but affected by precipitation
    const hydroEfficiency = weather.condition === 'rain' ? 0.95 : 0.85;
    const hydroOutput = hydroEfficiency * 400; // 400 MW capacity
    
    return {
      solar: {
        efficiency: (solarEfficiency * 100).toFixed(1) + '%',
        output: Math.round(solarOutput),
        capacity: 150
      },
      wind: {
        efficiency: (windEfficiency * 100).toFixed(1) + '%',
        output: Math.round(windOutput),
        capacity: 800
      },
      hydro: {
        efficiency: (hydroEfficiency * 100).toFixed(1) + '%',
        output: Math.round(hydroOutput),
        capacity: 400
      },
      totalRenewable: Math.round(solarOutput + windOutput + hydroOutput),
      renewablePercent: ((solarOutput + windOutput + hydroOutput) / 6050 * 100).toFixed(1) + '%'
    };
  }

  generateForecast() {
    // Simple trend analysis
    if (this.weatherHistory.length < 3) {
      return { confidence: 0, trend: 'INSUFFICIENT_DATA' };
    }
    
    const recent = this.weatherHistory.slice(-3);
    const avgRenewable = recent.reduce((sum, r) => 
      sum + r.renewableImpact.totalRenewable, 0) / recent.length;
    
    return {
      confidence: Math.min(0.9, 0.5 + this.weatherHistory.length * 0.02),
      expectedRenewableOutput: Math.round(avgRenewable),
      trend: avgRenewable > 1000 ? 'HIGH_RENEWABLE' : 
             avgRenewable > 500 ? 'MODERATE_RENEWABLE' : 'LOW_RENEWABLE',
      recommendation: avgRenewable > 800 ? 
        'High renewable generation expected - consider reducing thermal' : 
        'Low renewable generation - ensure thermal capacity ready'
    };
  }

  getStats() {
    return {
      ...super.getStats(),
      location: this.location,
      analysesCompleted: this.analysesCompleted,
      recentHistory: this.weatherHistory.slice(-3)
    };
  }
}

export default WeatherAnalyzer;
