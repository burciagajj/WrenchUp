import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const Fallback = this.props.fallback;
        return <Fallback error={this.state.error!} reset={this.reset} />;
      }

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {this.state.error?.message || "An unexpected error occurred."}
          </Text>

          <View style={styles.buttonRow}>
            <Pressable style={styles.button} onPress={this.reset}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>

            <Pressable
              style={[styles.button, styles.secondary]}
              onPress={() => {
                this.reset();
                router.replace("/(tabs)");
              }}
            >
              <Text style={styles.buttonText}>Go home</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0F172A",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#F8FAFC",
    marginBottom: 12,
  },
  message: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    backgroundColor: "#F97316",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  secondary: {
    backgroundColor: "#334155",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
