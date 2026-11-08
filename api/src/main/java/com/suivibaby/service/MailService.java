package com.suivibaby.service;

import io.quarkus.logging.Log;
import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

// One public method per mail. Sending never throws: a mail is a courtesy next to the on-screen link,
// so a failure (or a disabled relay) is reported as `false` and the caller carries on (D17-N, D17-Z).
@ApplicationScoped
public class MailService {

    @ConfigProperty(name = "app.mail.enabled", defaultValue = "false")
    boolean isEnabled;

    @ConfigProperty(name = "app.invitation.ttl-days", defaultValue = "3")
    long invitationTtlDays;

    @ConfigProperty(name = "app.activation.ttl-days", defaultValue = "7")
    long activationTtlDays;

    @Inject
    Mailer mailer;

    public boolean sendInvitation(String to, String inviterFirstName, String babyFirstName, String link) {
        String subject = inviterFirstName + " vous invite à suivre " + babyFirstName + " sur Suivi Baby";
        String text = """
                Bonjour,

                %s vous invite à suivre %s sur Suivi Baby.

                Pour accepter l'invitation, ouvrez ce lien (valable %d jours, utilisable une seule fois) :
                %s

                Si vous ne vous attendiez pas à ce message, ignorez-le.
                """.formatted(inviterFirstName, babyFirstName, invitationTtlDays, link);
        String html = """
                <p>Bonjour,</p>
                <p>%s vous invite à suivre %s sur Suivi Baby.</p>
                <p>Pour accepter l'invitation, ouvrez ce lien : <a href="%s">Accepter l'invitation</a> \
                (valable %d jours, utilisable une seule fois)</p>
                <p>Si vous ne vous attendiez pas à ce message, ignorez-le.</p>
                """.formatted(escapeHtml(inviterFirstName), escapeHtml(babyFirstName), link, invitationTtlDays);
        return deliver(new Mail().addTo(to).setSubject(subject).setText(text).setHtml(html));
    }

    public boolean sendActivation(String to, String inviteeFirstName, String adminFirstName, String link) {
        String subject = adminFirstName + " vous a créé un compte sur Suivi Baby";
        String text = """
                Bonjour %s,

                %s vous a créé un compte sur Suivi Baby.

                Pour définir votre mot de passe, ouvrez ce lien (valable %d jours, utilisable une seule fois) :
                %s

                Si vous ne vous attendiez pas à ce message, ignorez-le.
                """.formatted(inviteeFirstName, adminFirstName, activationTtlDays, link);
        String html = """
                <p>Bonjour %s,</p>
                <p>%s vous a créé un compte sur Suivi Baby.</p>
                <p>Pour définir votre mot de passe, ouvrez ce lien : <a href="%s">Définir mon mot de passe</a> \
                (valable %d jours, utilisable une seule fois)</p>
                <p>Si vous ne vous attendiez pas à ce message, ignorez-le.</p>
                """.formatted(escapeHtml(inviteeFirstName), escapeHtml(adminFirstName), link, activationTtlDays);
        return deliver(new Mail().addTo(to).setSubject(subject).setText(text).setHtml(html));
    }

    private boolean deliver(Mail mail) {
        if (!isEnabled) {
            return false;
        }
        try {
            mailer.send(mail);
            return true;
        } catch (RuntimeException e) {
            // Recipient and cause only: the message body carries the secret link.
            Log.warnf("Mail to %s could not be sent: %s", mail.getTo(), e.getMessage());
            return false;
        }
    }

    // First names are typed by a human and land in an HTML body: they must not be interpreted as markup.
    private String escapeHtml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
    }
}
