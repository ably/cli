import {Command, Flags} from '@oclif/core'
import chalk from 'chalk'
// We'll extend Command instead since SpacesBaseCommand doesn't seem to work here
// import SpacesBaseCommand from './spaces-base-command.js'

export default class SpacesLocations extends Command {
  static description = 'Spaces Locations API commands (Ably Spaces client-to-client location sharing)'

  // The help method is custom for this root command to show subcommands
  async run() {
    this.log(chalk.bold.cyan('Spaces Locations API Commands:'))
    this.log('\nAvailable commands:')
    this.log('  ably spaces locations get-all    - Get all current locations in a space')
    this.log('  ably spaces locations set        - Set location for a client in the space')
    this.log('  ably spaces locations subscribe  - Subscribe to location updates in a space')
    this.log('  ably spaces locations clear      - Clear location for the current client')
  }

  protected formatLocations(locationsData: any, format: string = 'text') {
    try {
      let locations: any[] = [];
      
      // Convert the structure to a consistent format with memberId and location
      if (locationsData && typeof locationsData === 'object') {
        if (Array.isArray(locationsData)) {
          // Already an array, check if it needs to be transformed
          locations = locationsData;
        } else {
          // Object with member IDs as keys, convert to array with proper format
          locations = Object.entries(locationsData).map(([memberId, locationData]) => ({
            memberId,
            location: locationData
          }));
        }
      }
      
      // Filter out locations with null/empty data before displaying
      const validLocations = locations.filter((item: any) => {
        if (item === null || item === undefined) return false;
        
        // Check different structures - get the location data however it's stored
        let locationData;
        if (item.location !== undefined) {
          locationData = item.location;
        } else if (item.data !== undefined) {
          locationData = item.data;
        } else {
          // For raw object structure, exclude known metadata fields
          const { clientId, id, userId, memberId, connectionId, member, ...rest } = item;
          // If all that's left is metadata, there's no real location data
          if (Object.keys(rest).length === 0) return false;
          locationData = rest;
        }
        
        // Strictly check if location data is empty or null
        if (locationData === null || locationData === undefined) return false;
        if (typeof locationData === 'object' && Object.keys(locationData).length === 0) return false;
        
        return true;
      });
      
      if (format === 'json') {
        return JSON.stringify(locations, null, 2);
      } else {
        if (!validLocations || validLocations.length === 0) {
          return chalk.yellow('No locations are currently set in this space.');
        } else {
          const locationsCount = validLocations.length;
          let output = `\n${chalk.cyan('Current locations')} (${chalk.bold(String(locationsCount))}):\n\n`;
          
          validLocations.forEach((locationItem: any) => {
            try {
              // Handle the different possible structures
              let memberId = 'Unknown';
              let locationData = {};
              
              if (locationItem?.memberId) {
                // If we converted it to {memberId, location} format
                memberId = locationItem.memberId;
                locationData = locationItem.location;
              } else if (locationItem?.member?.clientId) {
                // If we have { member: { clientId }, location }
                memberId = locationItem.member.clientId;
                locationData = locationItem.location || {};
              } else if (locationItem?.clientId) {
                // If we have { clientId, location } directly
                memberId = locationItem.clientId;
                locationData = locationItem.location || locationItem.data || {};
              } else if (typeof locationItem === 'object' && locationItem !== null) {
                // If the item itself is the location data
                // Try to extract memberId from somewhere
                memberId = locationItem.clientId || locationItem.id || locationItem.userId || locationItem.memberId || 'Unknown';
                
                // Use the whole object as location data, excluding some known metadata fields
                const { clientId: _, id: __, userId: ___, memberId: ____, connectionId: _____, ...rest } = locationItem;
                locationData = Object.keys(rest).length > 0 ? rest : {};
              }
              
              output += `- ${chalk.blue(memberId)}:\n`;
              
              // Handle different location data formats
              if (typeof locationData === 'object' && locationData !== null) {
                output += `  ${chalk.dim('Location:')} ${JSON.stringify(locationData, null, 2)}\n`;
              } else if (locationData !== undefined && locationData !== null) {
                // Handle primitive location data
                output += `  ${chalk.dim('Location:')} ${locationData}\n`;
              }
            } catch (err) {
              output += `- ${chalk.red('Error displaying location item')}: ${err instanceof Error ? err.message : String(err)}\n`;
            }
          });
          
          return output;
        }
      }
    } catch (error) {
      return chalk.red(`Error formatting locations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 