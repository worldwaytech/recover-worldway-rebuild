import React from 'react'
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

// Worldway-only content: never pass partner names, references or ids into this template.
interface Props {
  name?: string
  reference?: string
  tourName?: string
  tourDate?: string
  travellers?: string
  total?: string
  bookingUrl?: string
}

const Email = ({ name, reference, tourName, tourDate, travellers, total, bookingUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Worldway tour is confirmed{reference ? ` — ${reference}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>WORLDWAY TRAVELS GROUP</Text>
        <Heading style={h1}>Your tour is confirmed</Heading>
        <Text style={text}>{name ? `Dear ${name},` : 'Hello,'}</Text>
        <Text style={text}>Thank you for booking with Worldway Travels Group. Your tour is confirmed and your payment has been received.</Text>
        <Section style={box}>
          {reference && <Text style={row}><b>Worldway reference:</b> {reference}</Text>}
          {tourName && <Text style={row}><b>Tour:</b> {tourName}</Text>}
          {tourDate && <Text style={row}><b>Date:</b> {tourDate}</Text>}
          {travellers && <Text style={row}><b>Travellers:</b> {travellers}</Text>}
          {total && <Text style={row}><b>Total paid:</b> {total}</Text>}
        </Section>
        {bookingUrl && <Button href={bookingUrl} style={button}>View confirmation &amp; receipt</Button>}
        <Hr style={hr} />
        <Text style={small}>Please quote your Worldway reference in all correspondence. Your confirmation, receipt and invoice are always available in My account → Tours.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Your Worldway tour is confirmed${d.reference ? ` — ${d.reference}` : ''}`,
  displayName: 'Tour booking confirmation',
  previewData: { name: 'Mr Jane Doe', reference: 'WWT-1A2B3C4D5E', tourName: 'Golden Triangle Private Tour', tourDate: '12 Nov 2026', travellers: '2 adults', total: 'INR 48,500.00', bookingUrl: 'https://worldwaytravelsgroup.com/account/tours' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const brand = { fontSize: '11px', letterSpacing: '3px', color: '#B8912F', margin: '0 0 16px' }
const h1 = { fontSize: '24px', color: '#111111', margin: '0 0 16px', fontWeight: 'normal' as const }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6' }
const box = { border: '1px solid #e7dcc2', borderRadius: '10px', padding: '12px 18px', margin: '20px 0' }
const row = { fontSize: '14px', color: '#222222', margin: '6px 0' }
const button = { backgroundColor: '#111111', color: '#F5EFE3', borderRadius: '999px', padding: '12px 22px', fontSize: '13px', letterSpacing: '1px', textDecoration: 'none' }
const hr = { borderColor: '#eeeeee', margin: '28px 0 16px' }
const small = { fontSize: '12px', color: '#777777', lineHeight: '1.5' }
