# Use slim and secure base image
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and lock file first for efficient caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy the rest of the source code
COPY . .

# Inform Azure Container App to expose port 3000
EXPOSE 3000

# Start the Express server
CMD ["node", "index.js"]
