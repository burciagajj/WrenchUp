import { Pressable, Text, View, type ViewProps } from "react-native";
import { SafeAreaView, useSafeAreaInsets, type Edge } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { cn } from "@/lib/utils";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { haptic } from "@/lib/haptics";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;

  // === Optional consistent header (recommended for secondary screens) ===
  /**
   * Show a back button in the header area.
   */
  showBackButton?: boolean;
  /**
   * Optional title shown next to the back button.
   */
  title?: string;
  /**
   * Custom back handler. Falls back to router.back().
   */
  onBack?: () => void;
  /**
   * Optional right-side element in the header (e.g. refresh button, actions).
   */
  headerRight?: React.ReactNode;
}

/**
 * A container component that properly handles SafeArea and background colors.
 *
 * The outer View extends to full screen (including status bar area) with the background color,
 * while the inner SafeAreaView ensures content is within safe bounds.
 *
 * When showBackButton or title is provided, a consistent, safe-area-aware header is rendered.
 *
 * Usage:
 * ```tsx
 * <ScreenContainer showBackButton title="Tracking">
 *   ...
 * </ScreenContainer>
 * ```
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  showBackButton,
  title,
  onBack,
  headerRight,
  ...props
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const shouldShowHeader = showBackButton || title || headerRight;

  const handleBack = () => {
    haptic.light();
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  const topInset = insets.top > 0 ? insets.top : 8;

  return (
    <View
      className={cn(
        "flex-1",
        "bg-background",
        containerClassName
      )}
      {...props}
    >
      <SafeAreaView
        edges={edges}
        className={cn("flex-1 bg-background", safeAreaClassName)}
        style={style}
      >
        {/* Consistent branded header (orange) with back button + proper status bar clearance */}
        {shouldShowHeader && (
          <View
            style={{
              paddingTop: Math.max(topInset, 8),
              paddingHorizontal: 16,
              paddingBottom: 10,
              backgroundColor: "#F97316", // Orange brand color
            }}
            className="flex-row items-center justify-between"
          >
            <View className="flex-row items-center flex-1">
              {showBackButton && (
                <Pressable
                  onPress={handleBack}
                  hitSlop={12}
                  className="mr-3 w-9 h-9 rounded-full bg-white/20 items-center justify-center"
                >
                  <IconSymbol name="chevron.left" size={22} color="#FFFFFF" />
                </Pressable>
              )}
              {title && (
                <View className="flex-1">
                  <Text className="text-[17px] font-extrabold text-white" numberOfLines={1}>
                    {title}
                  </Text>
                </View>
              )}
            </View>

            {headerRight && (
              <View className="flex-row items-center">{headerRight}</View>
            )}
          </View>
        )}

        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
