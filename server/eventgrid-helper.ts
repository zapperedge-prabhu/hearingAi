import { EventGridManagementClient } from "@azure/arm-eventgrid";
import { DefaultAzureCredential } from "@azure/identity";

/**
 * Event Grid Helper Module for Zapper
 * Handles creation and deletion of Event Grid Topics and Subscriptions
 * for HNS storage accounts malware scanning integration
 */

const ZAPPER_HNS_FLAG = process.env.ZAPPER_HNS_FLAG === "TRUE" || process.env.ZAPPER_HNS_FLAG === "true";

export interface EventGridResources {
  topicResourceId: string;
  topicEndpoint: string;
  subscriptionId: string;
}

/**
 * Create Event Grid Topic for malware scanning events
 */
export async function createEventGridTopic(
  subscriptionId: string,
  resourceGroupName: string,
  region: string,
  storageAccountName: string
): Promise<{ topicResourceId: string; topicEndpoint: string }> {
  const credential = new DefaultAzureCredential();
  const client = new EventGridManagementClient(credential, subscriptionId);

  // Generate unique topic name with zapper-defender- prefix for resource discovery
  const guid = Math.random().toString(36).substring(2, 8);
  const topicName = `zapper-defender-topic-${storageAccountName}-${guid}`;

  console.log(`[EVENT GRID] Creating topic: ${topicName} in ${resourceGroupName}, region: ${region}`);

  try {
    const topic = await client.topics.beginCreateOrUpdateAndWait(
      resourceGroupName,
      topicName,
      {
        location: region,
        inputSchema: "EventGridSchema",
        tags: {
          createdBy: "zapper",
          purpose: "malware-scanning",
          storageAccount: storageAccountName
        }
      }
    );

    console.log(`[EVENT GRID] Topic created successfully: ${topic.id}`);

    return {
      topicResourceId: topic.id!,
      topicEndpoint: topic.endpoint!
    };
  } catch (error: any) {
    console.error(`[EVENT GRID] Error creating topic:`, error.message);
    throw new Error(`Failed to create Event Grid topic: ${error.message}`);
  }
}

/**
 * Create Event Subscription to forward events to Zapper webhook
 */
export async function createEventSubscription(
  subscriptionId: string,
  resourceGroupName: string,
  topicName: string,
  webhookUrl: string,
  storageAccountName: string
): Promise<string> {
  const credential = new DefaultAzureCredential();
  const client = new EventGridManagementClient(credential, subscriptionId);

  // Generate unique subscription name with zapper-defender- prefix for resource discovery
  const guid = Math.random().toString(36).substring(2, 8);
  const subscriptionName = `zapper-defender-sub-${storageAccountName}-${guid}`;

  console.log(`[EVENT GRID] Creating subscription: ${subscriptionName} for topic: ${topicName}`);
  console.log(`[EVENT GRID] Webhook URL: ${webhookUrl}`);

  try {
    const eventSubscription = await client.topicEventSubscriptions.beginCreateOrUpdateAndWait(
      resourceGroupName,
      topicName,
      subscriptionName,
      {
        destination: {
          endpointType: "WebHook",
          endpointUrl: webhookUrl,
          maxEventsPerBatch: 1,
          preferredBatchSizeInKilobytes: 64
        } as any, // Using any to bypass SDK type constraints
        filter: {
          includedEventTypes: ["Microsoft.Security.MalwareScanningResult"],
          isSubjectCaseSensitive: false
        },
        eventDeliverySchema: "EventGridSchema",
        retryPolicy: {
          maxDeliveryAttempts: 30,
          eventTimeToLiveInMinutes: 1440
        }
      }
    );

    console.log(`[EVENT GRID] Subscription created successfully: ${eventSubscription.id}`);

    return eventSubscription.name!;
  } catch (error: any) {
    console.error(`[EVENT GRID] Error creating subscription:`, error.message);
    throw new Error(`Failed to create Event Grid subscription: ${error.message}`);
  }
}

/**
 * Delete Event Grid Topic and all its subscriptions
 */
export async function deleteEventGridTopic(
  subscriptionId: string,
  resourceGroupName: string,
  topicName: string
): Promise<void> {
  const credential = new DefaultAzureCredential();
  const client = new EventGridManagementClient(credential, subscriptionId);

  console.log(`[EVENT GRID] Deleting topic: ${topicName} in ${resourceGroupName}`);

  try {
    await client.topics.beginDeleteAndWait(resourceGroupName, topicName);
    console.log(`[EVENT GRID] Topic deleted successfully`);
  } catch (error: any) {
    console.error(`[EVENT GRID] Error deleting topic:`, error.message);
    throw new Error(`Failed to delete Event Grid topic: ${error.message}`);
  }
}

/**
 * Delete Event Grid Subscription
 */
export async function deleteEventSubscription(
  subscriptionId: string,
  resourceGroupName: string,
  topicName: string,
  subscriptionName: string
): Promise<void> {
  const credential = new DefaultAzureCredential();
  const client = new EventGridManagementClient(credential, subscriptionId);

  console.log(`[EVENT GRID] Deleting subscription: ${subscriptionName} from topic: ${topicName}`);

  try {
    await client.topicEventSubscriptions.beginDeleteAndWait(
      resourceGroupName,
      topicName,
      subscriptionName
    );
    console.log(`[EVENT GRID] Subscription deleted successfully`);
  } catch (error: any) {
    console.error(`[EVENT GRID] Error deleting subscription:`, error.message);
    throw new Error(`Failed to delete Event Grid subscription: ${error.message}`);
  }
}

/**
 * List Event Grid Topics for a storage account
 */
export async function listEventGridTopicsForStorageAccount(
  subscriptionId: string,
  resourceGroupName: string,
  storageAccountName: string
): Promise<Array<{ name: string; id: string; endpoint: string }>> {
  const credential = new DefaultAzureCredential();
  const client = new EventGridManagementClient(credential, subscriptionId);

  console.log(`[EVENT GRID] Listing topics for storage account: ${storageAccountName}`);

  try {
    const topics: Array<{ name: string; id: string; endpoint: string }> = [];
    
    for await (const topic of client.topics.listByResourceGroup(resourceGroupName)) {
      // Filter topics created by Zapper for this storage account
      // Check both naming convention (zapper-defender-) and tags
      const matchesByName = topic.name?.startsWith('zapper-defender-') && topic.name?.includes(storageAccountName);
      const matchesByTags = topic.tags?.createdBy === "zapper" && topic.tags?.storageAccount === storageAccountName;
      
      if (matchesByName || matchesByTags) {
        topics.push({
          name: topic.name!,
          id: topic.id!,
          endpoint: topic.endpoint!
        });
      }
    }

    console.log(`[EVENT GRID] Found ${topics.length} topics for ${storageAccountName}`);
    return topics;
  } catch (error: any) {
    console.error(`[EVENT GRID] Error listing topics:`, error.message);
    return [];
  }
}

/**
 * Check if HNS flag is enabled
 */
export function isHNSEnabled(): boolean {
  return ZAPPER_HNS_FLAG;
}
